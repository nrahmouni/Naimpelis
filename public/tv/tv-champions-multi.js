// ===================================================================
// SMART TV 10-FOOT CHAMPIONS HUB & MULTI-PARTIDO ENGINE (2-4 SCREENS, ES5)
// ===================================================================
(function () {
  var MAX_TV_MULTI = 4;
  var tvChampFetchSeq = 0;

  var tvChampState = {
    loading: false,
    loadedOnce: false,
    error: false,
    lastFetchAt: 0,
    matches: [],
    boardMatches: [],
    multiplexChannels: [],
    standings: null,
    selectedSources: [],
    pickerFilter: 'all',
    multiActive: false,
    generation: 0,
    audioSlot: 0,
    slotStates: [],
    slotHlsInstances: []
  };

  function champLang() {
    if (typeof activeTvLang === 'string') {
      if (activeTvLang === 'en') return 'EN';
      if (activeTvLang === 'zh') return 'ZH';
    }
    return 'ES';
  }

  function champTxt(es, ca, en) {
    if (typeof activeTvLang === 'string') {
      if (activeTvLang === 'ca' && ca) return ca;
      if (activeTvLang === 'en' && en) return en;
    }
    return es;
  }

  function formatMadridDateKey() {
    try {
      var d = new Date();
      var y = d.getFullYear();
      var m = d.getMonth() + 1;
      var day = d.getDate();
      return String(y) + (m < 10 ? '0' + m : String(m)) + (day < 10 ? '0' + day : String(day));
    } catch (e) {
      return '';
    }
  }

  function dedupeUrlList(primary, extras) {
    var out = [];
    var seen = {};
    var i;
    function pushUrl(u) {
      var clean = String(u || '').replace(/^\s+|\s+$/g, '');
      if (!clean || seen[clean]) return;
      seen[clean] = true;
      out.push(clean);
    }
    pushUrl(primary);
    if (Array.isArray(extras)) {
      for (i = 0; i < extras.length; i++) {
        pushUrl(extras[i]);
      }
    }
    return out;
  }

  function inferMultiResolver(urlStr) {
    var s = String(urlStr || '');
    if (/\.m3u8(\?|$)/i.test(s)) return 'tdt_hls';
    if (/\.mp4(\?|$)/i.test(s)) return 'direct_mp4';
    return 'sports_channel';
  }

  function isInstantMultiUrl(urlStr, resolverType) {
    var s = String(urlStr || '');
    if (!s) return false;
    if (/^\/api\/(?:hls-proxy|iptv\/live|dvb-live|vod-manifest|providers\/stream|belix\/stream)/i.test(s)) {
      return true;
    }
    if (
      resolverType === 'tdt_hls' &&
      typeof isDirectCorsPublicStream === 'function' &&
      isDirectCorsPublicStream(s)
    ) {
      return true;
    }
    return false;
  }

  function buildSourceFromMatch(m) {
    if (!m || !Array.isArray(m.channels) || !m.channels.length) return null;
    var chosen = null;
    var i;
    for (i = 0; i < m.channels.length; i++) {
      if (m.channels[i] && m.channels[i].sourceUrl) {
        if (!chosen) chosen = m.channels[i];
        var lbl = String((m.channels[i].label || '') + ' ' + (m.channels[i].lang || '')).toUpperCase();
        if (lbl.indexOf('ES') !== -1 || lbl.indexOf('MOVISTAR') !== -1 || lbl.indexOf('DAZN') !== -1) {
          chosen = m.channels[i];
          break;
        }
      }
    }
    if (!chosen || !chosen.sourceUrl) return null;
    var fallbacks = [];
    for (i = 0; i < m.channels.length; i++) {
      if (m.channels[i] && m.channels[i].sourceUrl && m.channels[i].sourceUrl !== chosen.sourceUrl) {
        fallbacks.push(m.channels[i].sourceUrl);
      }
    }
    return {
      sourceUrl: chosen.sourceUrl,
      fallbackUrls: fallbacks,
      title: (m.homeTeam || '') + ' vs ' + (m.awayTeam || ''),
      subtitle: m.leagueName || m.groupTitle || 'UEFA Champions League',
      matchId: m.id || ''
    };
  }

  function buildSourceFromMultiplex(ch, trackIdx) {
    if (!ch || !Array.isArray(ch.channels) || !ch.channels.length) return null;
    var safeIdx = typeof trackIdx === 'number' && trackIdx >= 0 && trackIdx < ch.channels.length ? trackIdx : 0;
    var chosen = ch.channels[safeIdx] || ch.channels[0];
    if (!chosen || !chosen.sourceUrl) return null;
    var fallbacks = [];
    for (var i = 0; i < ch.channels.length; i++) {
      if (ch.channels[i] && ch.channels[i].sourceUrl && ch.channels[i].sourceUrl !== chosen.sourceUrl) {
        fallbacks.push(ch.channels[i].sourceUrl);
      }
    }
    return {
      sourceUrl: chosen.sourceUrl,
      fallbackUrls: fallbacks,
      title: ch.name || 'MultiChampions',
      subtitle: ch.network || 'MultiChampions HD',
      matchId: 'mux-' + (ch.id || safeIdx)
    };
  }

  function getCombinedMatches() {
    var map = {};
    var out = [];
    var i, m, key;
    for (i = 0; i < tvChampState.matches.length; i++) {
      m = tvChampState.matches[i];
      if (!m) continue;
      key = m.id || ((m.eventId || '') + '-' + (m.homeTeam || ''));
      if (!map[key]) {
        map[key] = true;
        out.push(m);
      }
    }
    for (i = 0; i < tvChampState.boardMatches.length; i++) {
      m = tvChampState.boardMatches[i];
      if (!m) continue;
      key = m.id || ((m.eventId || '') + '-' + (m.homeTeam || ''));
      if (!map[key]) {
        map[key] = true;
        out.push(m);
      }
    }
    out.sort(function (a, b) {
      function stRank(s) { return s === 'live' ? 0 : (s === 'upcoming' ? 1 : 2); }
      var ra = stRank(a.statusState);
      var rb = stRank(b.statusState);
      if (ra !== rb) return ra - rb;
      var fa = (a.channels && a.channels.length > 0) ? 1 : 0;
      var fb = (b.channels && b.channels.length > 0) ? 1 : 0;
      if (fa !== fb) return fb - fa;
      return (a.kickoffMs || 0) - (b.kickoffMs || 0);
    });
    return out;
  }

  function buildPresetPool() {
    var out = [];
    var seen = {};
    var i, j, src;
    function tryAdd(s) {
      if (!s || !s.sourceUrl || seen[s.sourceUrl]) return;
      seen[s.sourceUrl] = true;
      out.push(s);
    }
    for (i = 0; i < tvChampState.matches.length; i++) {
      if (tvChampState.matches[i] && tvChampState.matches[i].statusState === 'live') {
        tryAdd(buildSourceFromMatch(tvChampState.matches[i]));
      }
    }
    for (i = 0; i < tvChampState.multiplexChannels.length; i++) {
      var mux = tvChampState.multiplexChannels[i];
      if (!mux) continue;
      tryAdd(buildSourceFromMultiplex(mux, 0));
      if (Array.isArray(mux.channels) && mux.channels.length > 1) {
        for (j = 1; j < mux.channels.length; j++) {
          tryAdd(buildSourceFromMultiplex(mux, j));
        }
      }
    }
    var combined = getCombinedMatches();
    for (i = 0; i < combined.length; i++) {
      src = buildSourceFromMatch(combined[i]);
      if (src) tryAdd(src);
    }
    return out;
  }

  function findSourceInBuilder(src) {
    if (!src) return -1;
    for (var i = 0; i < tvChampState.selectedSources.length; i++) {
      var cur = tvChampState.selectedSources[i];
      if (!cur) continue;
      if (src.matchId && cur.matchId) {
        if (cur.matchId === src.matchId) return i;
        continue;
      }
      if (cur.sourceUrl === src.sourceUrl) return i;
    }
    return -1;
  }

  function rerenderChampionsPreservingFocus(fallbackFocusKey) {
    if (typeof activeHubTab !== 'string' || activeHubTab !== 'champions' || typeof renderHubContent !== 'function') {
      return;
    }
    var activeKey = fallbackFocusKey || '';
    try {
      var ae = document.activeElement;
      if (ae && ae.getAttribute) {
        var k = ae.getAttribute('data-tv-focus-key');
        if (k) activeKey = k;
      }
    } catch (e) {}

    renderHubContent();

    if (activeKey) {
      setTimeout(function () {
        var root = document.getElementById('hub-dynamic-content');
        if (!root) return;
        var btns = root.querySelectorAll('[data-tv-focus-key]');
        var matched = null;
        for (var i = 0; i < btns.length; i++) {
          if (btns[i].getAttribute('data-tv-focus-key') === activeKey) {
            matched = btns[i];
            break;
          }
        }
        if (!matched && fallbackFocusKey && fallbackFocusKey !== activeKey) {
          for (var j = 0; j < btns.length; j++) {
            if (btns[j].getAttribute('data-tv-focus-key') === fallbackFocusKey) {
              matched = btns[j];
              break;
            }
          }
        }
        if (!matched) {
          matched = document.getElementById('btn-tv-ucl-launch');
        }
        if (matched && matched.focus) {
          try { matched.focus(); } catch (err) {}
        }
      }, 0);
    }
  }

  function toggleBuilderSource(src) {
    if (!src || !src.sourceUrl) return;
    var idx = findSourceInBuilder(src);
    if (idx !== -1) {
      tvChampState.selectedSources.splice(idx, 1);
    } else {
      if (tvChampState.selectedSources.length >= MAX_TV_MULTI) {
        if (typeof showToast === 'function') {
          showToast(champTxt(
            'Máximo 4 pantallas simultáneas. Quita una arriba para añadir otra.',
            'Màxim 4 pantalles simultànies. Treu-ne una per afegir-ne una altra.',
            'Maximum 4 screens at once. Remove one above first.'
          ));
        }
        return;
      }
      tvChampState.selectedSources.push(src);
    }
    rerenderChampionsPreservingFocus('launch');
  }

  function promoteBuilderSlotToFirst(idx) {
    if (idx <= 0 || idx >= tvChampState.selectedSources.length) return;
    var chosen = tvChampState.selectedSources.splice(idx, 1)[0];
    tvChampState.selectedSources.unshift(chosen);
    rerenderChampionsPreservingFocus('slot-p1:0');
  }

  function playSingleMatchOrChannel(title, subtitle, tracks) {
    if (!Array.isArray(tracks) || !tracks.length) {
      if (typeof showToast === 'function') {
        showToast(champTxt(
          'Sin señal emitida todavía para este evento.',
          'Sense senyal emesa encara per a aquest esdeveniment.',
          'No live stream available yet for this event.'
        ));
      }
      return;
    }
    if (typeof unlockAudio === 'function') unlockAudio();
    if (typeof playTdtChannelOnTv === 'function') {
      playTdtChannelOnTv(
        {
          id: 'tv-ucl-' + Date.now(),
          name: title || 'Champions HD',
          network: subtitle || 'UEFA Champions League',
          quality: '1080p HD',
          channels: tracks
        },
        0,
        false
      );
    }
  }

  function fetchChampionsHubData(forceRefresh) {
    var seq = ++tvChampFetchSeq;
    tvChampState.loading = true;
    tvChampState.error = false;
    var langParam = champLang();
    var pending = 2;
    var hubOk = false;

    function finishPart() {
      pending--;
      if (pending > 0) return;
      if (seq !== tvChampFetchSeq) return;
      tvChampState.loading = false;
      tvChampState.loadedOnce = true;
      tvChampState.lastFetchAt = Date.now();
      if (!hubOk && !tvChampState.matches.length && !tvChampState.multiplexChannels.length) {
        tvChampState.error = true;
      }
      if (!tvChampState.selectedSources.length) {
        var pool = buildPresetPool();
        for (var p = 0; p < Math.min(2, pool.length); p++) {
          tvChampState.selectedSources.push(pool[p]);
        }
      }
      if (typeof activeHubTab === 'string' && activeHubTab === 'champions' && typeof renderHubContent === 'function') {
        renderHubContent();
      }
    }

    xhrJson(
      'GET',
      '/api/sports/champions-hub?lang=' + encodeURIComponent(langParam) + (forceRefresh ? '&refresh=1' : ''),
      null,
      function (err, data) {
        if (seq !== tvChampFetchSeq) return;
        if (!err && data) {
          hubOk = true;
          tvChampState.matches = Array.isArray(data.matches) ? data.matches : [];
          tvChampState.multiplexChannels = Array.isArray(data.multiplexChannels) ? data.multiplexChannels : [];
          tvChampState.standings = data.standings || null;
        }
        finishPart();
      }
    );

    var dKey = formatMadridDateKey();
    xhrJson(
      'GET',
      '/api/sports/football-board?date=' + encodeURIComponent(dKey) + '&lang=' + encodeURIComponent(langParam),
      null,
      function (err, data) {
        if (seq !== tvChampFetchSeq) return;
        if (!err && data && Array.isArray(data.matches)) {
          tvChampState.boardMatches = data.matches;
        }
        finishPart();
      }
    );
  }

  // ===================================================================
  // MULTI-SCREEN PLAYER ENGINE (2–4 SIMULTANEOUS STREAMS AT ~75VH)
  // ===================================================================
  function destroySlotHls(slotIdx) {
    var inst = tvChampState.slotHlsInstances[slotIdx];
    if (inst) {
      try { inst.destroy(); } catch (e) {}
      tvChampState.slotHlsInstances[slotIdx] = null;
    }
  }

  function clearMultiDomMedia() {
    var grid = document.getElementById('tv-multi-grid');
    var bar = document.getElementById('tv-multi-bar');
    for (var i = 0; i < tvChampState.slotHlsInstances.length; i++) {
      destroySlotHls(i);
    }
    tvChampState.slotHlsInstances = [];
    if (grid) {
      var vids = grid.querySelectorAll('video');
      for (var v = 0; v < vids.length; v++) {
        try {
          vids[v].pause();
          vids[v].removeAttribute('src');
          vids[v].load();
        } catch (e) {}
      }
      grid.innerHTML = '';
    }
    if (bar) bar.innerHTML = '';
  }

  function stopTvMultiPlaybackInternal(silent) {
    var wasActive = tvChampState.multiActive;
    tvChampState.generation += 1;
    tvChampState.multiActive = false;
    tvChampState.slotStates = [];
    clearMultiDomMedia();
    var wrap = document.getElementById('tv-multi-wrap');
    if (wrap) wrap.style.display = 'none';
    if (!silent && wasActive) {
      if (typeof exitPlayerToHubOrPairing === 'function') {
        exitPlayerToHubOrPairing();
      }
    }
  }

  function setMultiAudioSlot(nextSlot) {
    var total = tvChampState.slotStates.length;
    if (!total) return;
    var safeSlot = nextSlot >= 0 && nextSlot < total ? nextSlot : 0;
    tvChampState.audioSlot = safeSlot;

    var grid = document.getElementById('tv-multi-grid');
    if (grid) {
      for (var i = 0; i < total; i++) {
        var tile = document.getElementById('tv-mv-tile-' + i);
        var vid = document.getElementById('tv-mv-video-' + i);
        var isActive = i === safeSlot;
        if (tile) {
          tile.className = 'tv-mv-tile tv-mv-slot-' + i + (isActive ? ' audio-active' : '');
        }
        if (vid) {
          try {
            vid.muted = !isActive;
            vid.volume = isActive ? (typeof currentVolume === 'number' ? currentVolume : 1) : 0;
            if (isActive && vid.paused) {
              var p = vid.play();
              if (p && p.catch) {
                p.catch(function () {
                  try { vid.muted = true; vid.play(); } catch (e2) {}
                });
              }
            }
          } catch (e) {}
        }
      }
    }
    renderMultiControlBar();
  }

  function updateTileOverlay(slotIdx, stateText, showButtons) {
    var ov = document.getElementById('tv-mv-overlay-' + slotIdx);
    var txt = document.getElementById('tv-mv-status-' + slotIdx);
    var btns = document.getElementById('tv-mv-btns-' + slotIdx);
    if (!ov) return;
    if (!stateText) {
      ov.style.display = 'none';
      return;
    }
    ov.style.display = 'flex';
    if (txt) txt.textContent = stateText;
    if (btns) btns.style.display = showButtons ? 'flex' : 'none';
  }

  function attachMultiSlotStream(slotIdx, resolvedUrl, mode, candidateList, curTryIdx, myGen) {
    if (!tvChampState.multiActive || myGen !== tvChampState.generation) return;
    var vid = document.getElementById('tv-mv-video-' + slotIdx);
    if (!vid) return;

    destroySlotHls(slotIdx);
    var slotObj = tvChampState.slotStates[slotIdx];
    if (!slotObj) return;
    slotObj.resolvedUrl = resolvedUrl;
    slotObj.resolvedMode = mode || 'hls';
    slotObj.status = 'connecting';
    slotObj.lastTryIdx = curTryIdx;

    var isActiveAudio = tvChampState.audioSlot === slotIdx;
    vid.muted = !isActiveAudio;
    vid.volume = isActiveAudio ? (typeof currentVolume === 'number' ? currentVolume : 1) : 0;

    function playTileSafe() {
      if (!tvChampState.multiActive || myGen !== tvChampState.generation) return;
      var wantUnmuted = tvChampState.audioSlot === slotIdx;
      vid.muted = !wantUnmuted;
      var pr = vid.play();
      if (pr && pr.catch) {
        pr.catch(function () {
          try {
            vid.muted = true;
            var p2 = vid.play();
            if (p2 && p2.catch) p2.catch(function () {});
          } catch (e) {}
        });
      }
    }

    function advanceOrFail(reason) {
      if (!tvChampState.multiActive || myGen !== tvChampState.generation) return;
      destroySlotHls(slotIdx);
      if (curTryIdx + 1 < candidateList.length) {
        resolveMultiSlotAtIndex(slotIdx, curTryIdx + 1, myGen);
        return;
      }
      slotObj.status = 'error';
      updateTileOverlay(
        slotIdx,
        reason || champTxt('Señal interrumpida en P' + (slotIdx + 1), 'Senyal interromput a P' + (slotIdx + 1), 'Feed interrupted on P' + (slotIdx + 1)),
        true
      );
    }

    vid.onplaying = function () {
      if (!tvChampState.multiActive || myGen !== tvChampState.generation) return;
      slotObj.status = 'playing';
      updateTileOverlay(slotIdx, '', false);
    };
    vid.onloadeddata = function () {
      if (vid.videoWidth > 0) {
        slotObj.status = 'playing';
        updateTileOverlay(slotIdx, '', false);
      }
    };

    if (mode === 'direct' || !(window.Hls && window.Hls.isSupported())) {
      vid.src = resolvedUrl;
      vid.onloadedmetadata = playTileSafe;
      vid.onerror = function () {
        advanceOrFail('Error de señal');
      };
      return;
    }

    var netRecoveries = 0;
    var mediaRecoveries = 0;
    var isSmart = typeof isSmartTvUa !== 'undefined' ? Boolean(isSmartTvUa) : false;
    var hls = new window.Hls({
      enableWorker: !isSmart,
      lowLatencyMode: false,
      startPosition: -1,
      liveSyncDurationCount: 2,
      liveMaxLatencyDurationCount: 9,
      maxBufferLength: 18,
      maxMaxBufferLength: 34,
      capLevelToPlayerSize: true,
      manifestLoadingTimeOut: 11000,
      manifestLoadingMaxRetry: 3,
      levelLoadingTimeOut: 10000,
      levelLoadingMaxRetry: 3,
      fragLoadingTimeOut: 12000,
      fragLoadingMaxRetry: 4
    });
    tvChampState.slotHlsInstances[slotIdx] = hls;
    hls.loadSource(resolvedUrl);
    hls.attachMedia(vid);
    hls.on(window.Hls.Events.MANIFEST_PARSED, function () {
      playTileSafe();
    });
    hls.on(window.Hls.Events.FRAG_BUFFERED, function () {
      playTileSafe();
    });
    hls.on(window.Hls.Events.ERROR, function (_ev, data) {
      if (!data || !data.fatal) return;
      if (!tvChampState.multiActive || myGen !== tvChampState.generation) return;
      if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR && netRecoveries < 2) {
        netRecoveries += 1;
        hls.startLoad();
        return;
      }
      if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 2) {
        mediaRecoveries += 1;
        hls.recoverMediaError();
        return;
      }
      advanceOrFail('Corte de señal en P' + (slotIdx + 1));
    });
  }

  function resolveMultiSlotAtIndex(slotIdx, tryIdx, myGen) {
    if (!tvChampState.multiActive || myGen !== tvChampState.generation) return;
    var slotObj = tvChampState.slotStates[slotIdx];
    if (!slotObj) return;
    var candidates = slotObj.candidates;
    if (!candidates || tryIdx >= candidates.length) {
      slotObj.status = 'error';
      updateTileOverlay(
        slotIdx,
        champTxt('Señal no disponible en P' + (slotIdx + 1), 'Senyal no disponible a P' + (slotIdx + 1), 'Stream unavailable on P' + (slotIdx + 1)),
        true
      );
      return;
    }

    var rawUrl = candidates[tryIdx];
    var rType = inferMultiResolver(rawUrl);
    slotObj.status = 'loading';
    updateTileOverlay(
      slotIdx,
      champTxt('Conectando P' + (slotIdx + 1) + '...', 'Connectant P' + (slotIdx + 1) + '...', 'Connecting P' + (slotIdx + 1) + '...'),
      false
    );

    if (isInstantMultiUrl(rawUrl, rType)) {
      attachMultiSlotStream(
        slotIdx,
        rawUrl,
        rType === 'direct_mp4' ? 'direct' : 'hls',
        candidates,
        tryIdx,
        myGen
      );
      return;
    }

    if (typeof getCachedLiveExtract === 'function') {
      var cached = getCachedLiveExtract(rType, rawUrl);
      if (cached && cached.streamUrl) {
        attachMultiSlotStream(slotIdx, cached.streamUrl, cached.mode || 'hls', candidates, tryIdx, myGen);
        return;
      }
    }

    if (tryIdx === 0 && candidates.length > 0 && !slotObj.fastRaceTried) {
      slotObj.fastRaceTried = true;
      try {
        var fastTracks = [];
        var fi;
        for (fi = 0; fi < candidates.length; fi++) {
          fastTracks.push({
            id: 'tv-multi-' + slotIdx + '-' + fi,
            label: (slotObj.source && slotObj.source.title) || ('P' + (slotIdx + 1)),
            lang: champLang(),
            sourceUrl: candidates[fi],
            resolverType: inferMultiResolver(candidates[fi])
          });
        }
        var fastXhr = new XMLHttpRequest();
        fastXhr.open('POST', '/api/live/fast-resolve', true);
        fastXhr.timeout = 4200;
        fastXhr.setRequestHeader('Content-Type', 'application/json');
        fastXhr.onreadystatechange = function () {
          if (fastXhr.readyState !== 4) return;
          if (!tvChampState.multiActive || myGen !== tvChampState.generation) return;
          if (fastXhr.status >= 200 && fastXhr.status < 300) {
            try {
              var fData = JSON.parse(fastXhr.responseText || '{}');
              if (fData && fData.ok && fData.streamUrl) {
                attachMultiSlotStream(
                  slotIdx,
                  fData.streamUrl,
                  fData.mode || 'hls',
                  candidates,
                  tryIdx,
                  myGen
                );
                return;
              }
            } catch (_eParse) {}
          }
          resolveMultiSlotAtIndex(slotIdx, tryIdx, myGen);
        };
        fastXhr.send(JSON.stringify({
          channelId: (slotObj.source && slotObj.source.matchId) || ('multi-slot-' + slotIdx),
          title: (slotObj.source && slotObj.source.title) || ('P' + (slotIdx + 1)),
          preferLang: champLang(),
          tracks: fastTracks
        }));
        return;
      } catch (_eFast) {}
    }

    var q =
      'resolverType=' + encodeURIComponent(rType) +
      '&url=' + encodeURIComponent(rawUrl) +
      '&title=' + encodeURIComponent(slotObj.source.title || ('P' + (slotIdx + 1))) +
      '&channelLabel=' + encodeURIComponent(slotObj.source.subtitle || slotObj.source.title || '');

    xhrJson('GET', '/api/extract/stream?' + q, null, function (err, data) {
      if (!tvChampState.multiActive || myGen !== tvChampState.generation) return;
      if (!err && data && data.success && data.streamUrl) {
        if (typeof setCachedLiveExtract === 'function') {
          setCachedLiveExtract(rType, rawUrl, data);
        }
        attachMultiSlotStream(slotIdx, data.streamUrl, data.mode || 'hls', candidates, tryIdx, myGen);
        return;
      }
      resolveMultiSlotAtIndex(slotIdx, tryIdx + 1, myGen);
    });
  }

  function retryMultiSlot(slotIdx) {
    var slotObj = tvChampState.slotStates[slotIdx];
    if (!slotObj) return;
    if (slotObj.candidates.length > 1) {
      var rotated = slotObj.candidates.slice(1);
      rotated.push(slotObj.candidates[0]);
      slotObj.candidates = rotated;
    }
    resolveMultiSlotAtIndex(slotIdx, 0, tvChampState.generation);
  }

  function swapMultiSlotToPrimary(slotIdx) {
    var list = [];
    var i;
    if (slotIdx <= 0 || slotIdx >= tvChampState.slotStates.length) return;
    for (i = 0; i < tvChampState.slotStates.length; i++) {
      list.push(tvChampState.slotStates[i].source);
    }
    var tmp = list[0];
    list[0] = list[slotIdx];
    list[slotIdx] = tmp;
    startTvMultiPlayback(list);
  }

  function removeMultiSlot(slotIdx) {
    var remaining = [];
    for (var i = 0; i < tvChampState.slotStates.length; i++) {
      if (i !== slotIdx) remaining.push(tvChampState.slotStates[i].source);
    }
    if (!remaining.length) {
      stopTvMultiPlaybackInternal(false);
      return;
    }
    if (remaining.length === 1) {
      var sole = remaining[0];
      var urls = dedupeUrlList(sole.sourceUrl, sole.fallbackUrls);
      var tracks = [];
      for (var t = 0; t < urls.length; t++) {
        tracks.push({
          id: 'single-from-multi-' + t,
          label: t === 0 ? sole.title : (sole.title + ' · Señal ' + (t + 1)),
          lang: 'ES',
          sourceUrl: urls[t],
          resolverType: inferMultiResolver(urls[t])
        });
      }
      playSingleMatchOrChannel(sole.title, sole.subtitle, tracks);
      return;
    }
    startTvMultiPlayback(remaining);
  }

  function renderMultiControlBar(focusBarKey) {
    var bar = document.getElementById('tv-multi-bar');
    if (!bar) return;
    var activeKey = focusBarKey || '';
    if (!activeKey) {
      try {
        var ae = document.activeElement;
        if (ae && ae.parentNode === bar && ae.getAttribute) {
          activeKey = ae.getAttribute('data-tv-bar-key') || '';
        }
      } catch (e) {}
    }

    bar.innerHTML = '';
    var total = tvChampState.slotStates.length;

    for (var i = 0; i < total; i++) {
      (function (idx) {
        var st = tvChampState.slotStates[idx];
        var isAudio = tvChampState.audioSlot === idx;
        var aBtn = document.createElement('button');
        aBtn.type = 'button';
        aBtn.className = isAudio ? 'tv-btn-primary' : 'tv-btn';
        aBtn.tabIndex = 0;
        aBtn.setAttribute('data-tv-bar-key', 'audio:' + idx);
        aBtn.textContent = (isAudio ? '🔊 Audio P' : '🔇 Oír P') + (idx + 1) + ' · ' + ((st && st.source && st.source.title) || '').slice(0, 18);
        aBtn.onclick = function () {
          setMultiAudioSlot(idx);
        };
        bar.appendChild(aBtn);
      })(i);
    }

    var retryAllBtn = document.createElement('button');
    retryAllBtn.type = 'button';
    retryAllBtn.className = 'tv-btn';
    retryAllBtn.tabIndex = 0;
    retryAllBtn.setAttribute('data-tv-bar-key', 'retry');
    retryAllBtn.textContent = champTxt('Reintentar caídas', 'Reintentar caigudes', 'Retry failed');
    retryAllBtn.onclick = function () {
      var retriedAny = false;
      for (var r = 0; r < tvChampState.slotStates.length; r++) {
        if (tvChampState.slotStates[r] && tvChampState.slotStates[r].status === 'error') {
          retriedAny = true;
          retryMultiSlot(r);
        }
      }
      if (!retriedAny) {
        for (var r2 = 0; r2 < tvChampState.slotStates.length; r2++) {
          resolveMultiSlotAtIndex(r2, 0, tvChampState.generation);
        }
      }
    };
    bar.appendChild(retryAllBtn);

    if (typeof toggleFullscreen === 'function') {
      var fsBtn = document.createElement('button');
      fsBtn.type = 'button';
      fsBtn.className = 'tv-btn-fullscreen';
      fsBtn.tabIndex = 0;
      fsBtn.setAttribute('data-tv-bar-key', 'fs');
      fsBtn.textContent = typeof tvT === 'function' ? tvT('fsBtn') : 'Pantalla';
      fsBtn.onclick = function () {
        toggleFullscreen();
      };
      bar.appendChild(fsBtn);
    }

    var exitBtn = document.createElement('button');
    exitBtn.type = 'button';
    exitBtn.className = 'tv-btn';
    exitBtn.tabIndex = 0;
    exitBtn.setAttribute('data-tv-bar-key', 'exit');
    exitBtn.textContent = champTxt('Cambiar partidos / Salir', 'Canviar partits / Sortir', 'Change matches / Exit');
    exitBtn.onclick = function () {
      stopTvMultiPlaybackInternal(false);
    };
    bar.appendChild(exitBtn);

    if (activeKey) {
      var btns = bar.querySelectorAll('[data-tv-bar-key]');
      for (var b = 0; b < btns.length; b++) {
        if (btns[b].getAttribute('data-tv-bar-key') === activeKey && btns[b].focus) {
          try { btns[b].focus(); } catch (err) {}
          break;
        }
      }
    }
  }

  function startTvMultiPlayback(rawSources) {
    var clean = [];
    var seen = {};
    var i;
    if (Array.isArray(rawSources)) {
      for (i = 0; i < rawSources.length; i++) {
        var s = rawSources[i];
        if (!s || !s.sourceUrl || seen[s.sourceUrl]) continue;
        seen[s.sourceUrl] = true;
        clean.push(s);
        if (clean.length >= MAX_TV_MULTI) break;
      }
    }
    if (!clean.length) {
      if (typeof showToast === 'function') {
        showToast(champTxt(
          'Selecciona al menos 1 partido o canal para ver.',
          'Selecciona almenys 1 partit o canal per veure.',
          'Select at least 1 match or channel to watch.'
        ));
      }
      return;
    }

    if (clean.length === 1) {
      var one = clean[0];
      var oneUrls = dedupeUrlList(one.sourceUrl, one.fallbackUrls);
      var tracks = [];
      for (var t = 0; t < oneUrls.length; t++) {
        tracks.push({
          id: 'tv-ucl-one-' + t,
          label: t === 0 ? one.title : (one.title + ' · Señal ' + (t + 1)),
          lang: 'ES',
          sourceUrl: oneUrls[t],
          resolverType: inferMultiResolver(oneUrls[t])
        });
      }
      playSingleMatchOrChannel(one.title, one.subtitle, tracks);
      return;
    }

    if (typeof unlockAudio === 'function') unlockAudio();
    if (typeof clearVideoWatchdog === 'function') clearVideoWatchdog();
    if (typeof stopLiveStallMonitor === 'function') stopLiveStallMonitor();
    if (typeof destroyHls === 'function') destroyHls();
    if (typeof clearEmbedFrame === 'function') clearEmbedFrame();
    if (typeof closeMiniGuideDrawer === 'function') closeMiniGuideDrawer();
    if (typeof hideLiveZapOsd === 'function') hideLiveZapOsd();

    try {
      if (videoEl) {
        videoEl.pause();
        videoEl.removeAttribute('src');
        videoEl.load();
        videoEl.style.display = 'none';
      }
    } catch (e) {}
    if (ytWrap) ytWrap.style.display = 'none';
    if (embedWrap) embedWrap.style.display = 'none';
    if (standbyOverlay) standbyOverlay.style.display = 'none';
    if (unmuteBanner) unmuteBanner.style.display = 'none';
    if (hudEl) hudEl.className = 'hidden-hud';
    if (bottomDockEl) bottomDockEl.className = 'hidden-hud';

    stopTvMultiPlaybackInternal(true);
    var myGen = ++tvChampState.generation;
    tvChampState.multiActive = true;
    tvChampState.audioSlot = 0;
    isLocalPlayback = true;
    isPaired = false;
    activeLiveChannel = null;
    currentMode = 'multi';
    currentIsLive = true;

    for (i = 0; i < clean.length; i++) {
      tvChampState.slotStates.push({
        source: clean[i],
        candidates: dedupeUrlList(clean[i].sourceUrl, clean[i].fallbackUrls),
        status: 'loading',
        resolvedUrl: '',
        resolvedMode: 'hls',
        lastTryIdx: 0
      });
    }

    if (typeof switchTvScreen === 'function') switchTvScreen('player');
    var wrap = document.getElementById('tv-multi-wrap');
    var grid = document.getElementById('tv-multi-grid');
    if (wrap) wrap.style.display = 'flex';
    if (grid) {
      grid.className = 'mv-count-' + clean.length;
      grid.innerHTML = '';

      for (i = 0; i < clean.length; i++) {
        (function (slotIdx) {
          var item = clean[slotIdx];
          var tile = document.createElement('div');
          tile.id = 'tv-mv-tile-' + slotIdx;
          tile.className = 'tv-mv-tile tv-mv-slot-' + slotIdx + (slotIdx === 0 ? ' audio-active' : '');

          var vid = document.createElement('video');
          vid.id = 'tv-mv-video-' + slotIdx;
          vid.className = 'tv-mv-video';
          vid.setAttribute('playsinline', '');
          vid.setAttribute('webkit-playsinline', '');
          vid.muted = slotIdx !== 0;
          vid.onclick = function () {
            setMultiAudioSlot(slotIdx);
          };

          var hud = document.createElement('div');
          hud.className = 'tv-mv-hud';
          var titleDiv = document.createElement('div');
          titleDiv.className = 'tv-mv-title';
          titleDiv.innerHTML = '<span class="tv-mv-slot-pill">P' + (slotIdx + 1) + '</span>' + escapeHtml(item.title || ('Pantalla ' + (slotIdx + 1)));
          hud.appendChild(titleDiv);

          var tileActions = document.createElement('div');
          tileActions.style.cssText = 'display:flex;align-items:center;flex-shrink:0;';
          if (slotIdx > 0) {
            var swapBtn = document.createElement('button');
            swapBtn.type = 'button';
            swapBtn.className = 'tv-ucl-mini-btn';
            swapBtn.tabIndex = 0;
            swapBtn.textContent = 'P1';
            swapBtn.onclick = function () { swapMultiSlotToPrimary(slotIdx); };
            tileActions.appendChild(swapBtn);
          }
          var closeBtn = document.createElement('button');
          closeBtn.type = 'button';
          closeBtn.className = 'tv-ucl-mini-btn danger';
          closeBtn.tabIndex = 0;
          closeBtn.textContent = '×';
          closeBtn.onclick = function () { removeMultiSlot(slotIdx); };
          tileActions.appendChild(closeBtn);
          hud.appendChild(tileActions);

          var overlay = document.createElement('div');
          overlay.id = 'tv-mv-overlay-' + slotIdx;
          overlay.className = 'tv-mv-status-overlay';
          var stTxt = document.createElement('div');
          stTxt.id = 'tv-mv-status-' + slotIdx;
          stTxt.className = 'tv-mv-status-text';
          stTxt.textContent = champTxt('Conectando P' + (slotIdx + 1) + '...', 'Connectant P' + (slotIdx + 1) + '...', 'Connecting P' + (slotIdx + 1) + '...');
          var stBtns = document.createElement('div');
          stBtns.id = 'tv-mv-btns-' + slotIdx;
          stBtns.className = 'tv-mv-status-btns';
          stBtns.style.display = 'none';

          var retryBtn = document.createElement('button');
          retryBtn.type = 'button';
          retryBtn.className = 'tv-ucl-mini-btn active';
          retryBtn.tabIndex = 0;
          retryBtn.textContent = champTxt('Reintentar', 'Reintentar', 'Retry');
          retryBtn.onclick = function () { retryMultiSlot(slotIdx); };

          var rmBtn = document.createElement('button');
          rmBtn.type = 'button';
          rmBtn.className = 'tv-ucl-mini-btn danger';
          rmBtn.tabIndex = 0;
          rmBtn.textContent = champTxt('Quitar', 'Treure', 'Remove');
          rmBtn.onclick = function () { removeMultiSlot(slotIdx); };

          stBtns.appendChild(retryBtn);
          stBtns.appendChild(rmBtn);
          overlay.appendChild(stTxt);
          overlay.appendChild(stBtns);

          tile.appendChild(vid);
          tile.appendChild(hud);
          tile.appendChild(overlay);
          grid.appendChild(tile);
        })(i);
      }
    }

    renderMultiControlBar();

    for (i = 0; i < clean.length; i++) {
      resolveMultiSlotAtIndex(i, 0, myGen);
    }

    setTimeout(function () {
      var barEl = document.getElementById('tv-multi-bar');
      var firstBtn = barEl ? barEl.querySelector('button') : null;
      if (firstBtn && firstBtn.focus) firstBtn.focus();
    }, 120);
  }

  // ===================================================================
  // CHAMPIONS HUB RENDERER FOR TV (#hub-dynamic-content)
  // ===================================================================
  window.renderTvChampionsInto = function (container) {
    if (!container) return;
    container.innerHTML = '';

    var now = Date.now();
    if (!tvChampState.loading && (!tvChampState.loadedOnce || now - tvChampState.lastFetchAt > 45000)) {
      fetchChampionsHubData(false);
    }

    var pool = buildPresetPool();
    var presetDual = pool.slice(0, 2);
    var presetTriple = pool.slice(0, 3);
    var presetQuad = pool.slice(0, 4);

    // 1. Hero Banner + Quick Fill / Launch Shortcuts
    var selected = tvChampState.selectedSources;
    var hero = document.createElement('div');
    hero.className = 'tv-ucl-hero';
    hero.innerHTML =
      '<div class="tv-ucl-eyebrow">UEFA CHAMPIONS LEAGUE · MULTI-PARTIDO 1080P</div>' +
      '<div class="tv-ucl-title">' + escapeHtml(champTxt(
        'MultiChampions: elige 2, 3 o 4 partidos para ver a la vez',
        'MultiChampions: tria 2, 3 o 4 partits per veure alhora',
        'MultiChampions: pick 2, 3, or 4 matches to watch at once'
      )) + '</div>' +
      '<div class="tv-ucl-sub">' + escapeHtml(champTxt(
        'Baja a cualquier partido y pulsa Elegir (OK en tu mando). Luego pulsa Ver ahora para abrir hasta 4 pantallas con audio rápido P1–P4.',
        'Baixa a qualsevol partit i prem Triar (OK al comandament). Després prem Veure ara per obrir fins a 4 pantalles.',
        'Scroll to any match and press Pick (OK on remote), then press Watch now for up to 4 screens with P1–P4 audio switching.'
      )) + '</div>' +
      '<div class="tv-ucl-preset-row">' +
      '<button type="button" class="tv-btn-primary" id="btn-tv-ucl-launch-hero" data-tv-focus-key="launch-hero" tabindex="0">' +
        escapeHtml(selected.length >= 2
          ? champTxt('Ver mis ' + selected.length + ' partidos ahora', 'Veure els meus ' + selected.length + ' partits ara', 'Watch my ' + selected.length + ' matches now')
          : champTxt('Ver Dual rápido (2 · 3/4)', 'Veure Dual ràpid (2 · 3/4)', 'Quick Watch Dual (2 · 3/4)')) +
      '</button>' +
      '<button type="button" class="tv-btn" id="btn-tv-ucl-dual" data-tv-focus-key="quick-2" tabindex="0">Auto 2 (Dual)</button>' +
      '<button type="button" class="tv-btn" id="btn-tv-ucl-triple" data-tv-focus-key="quick-3" tabindex="0">Auto 3 (Triple)</button>' +
      '<button type="button" class="tv-btn" id="btn-tv-ucl-quad" data-tv-focus-key="quick-4" tabindex="0">Auto 4 (Quad)</button>' +
      '<button type="button" class="tv-btn" id="btn-tv-ucl-refresh" data-tv-focus-key="refresh" tabindex="0">' + escapeHtml(champTxt('Actualizar', 'Actualitzar', 'Refresh')) + '</button>' +
      '</div>';
    container.appendChild(hero);

    setTimeout(function () {
      var bLaunchH = document.getElementById('btn-tv-ucl-launch-hero');
      var bDual = document.getElementById('btn-tv-ucl-dual');
      var bTriple = document.getElementById('btn-tv-ucl-triple');
      var bQuad = document.getElementById('btn-tv-ucl-quad');
      var bRef = document.getElementById('btn-tv-ucl-refresh');
      if (bLaunchH) bLaunchH.onclick = function () { startTvMultiPlayback(selected.length >= 2 ? selected : presetDual); };
      if (bDual) bDual.onclick = function () { tvChampState.selectedSources = presetDual.slice(); rerenderChampionsPreservingFocus('quick-2'); };
      if (bTriple) bTriple.onclick = function () { tvChampState.selectedSources = presetTriple.slice(); rerenderChampionsPreservingFocus('quick-3'); };
      if (bQuad) bQuad.onclick = function () { tvChampState.selectedSources = presetQuad.slice(); rerenderChampionsPreservingFocus('quick-4'); };
      if (bRef) bRef.onclick = function () { fetchChampionsHubData(true); };
    }, 0);

    // 2. Multi-Partido 4-Slot Builder
    var builder = document.createElement('div');
    builder.className = 'tv-ucl-builder-panel';

    var bHead = document.createElement('div');
    bHead.className = 'tv-ucl-builder-head';
    var bTitleWrap = document.createElement('div');
    bTitleWrap.innerHTML =
      '<div class="tv-ucl-builder-title">' + escapeHtml(champTxt(
        'Tus partidos elegidos (' + selected.length + '/4 pantallas)',
        'Els teus partits triats (' + selected.length + '/4 pantalles)',
        'Your Selected Matches (' + selected.length + '/4 screens)'
      )) + '</div>' +
      '<div class="tv-ucl-builder-sub">' + escapeHtml(champTxt(
        'Usa las flechas y pulsa + Elegir en los partidos de abajo.',
        'Fes servir les fletxes i prem + Triar als partits de sota.',
        'Use remote arrows and press + Pick on matches below.'
      )) + '</div>';
    var bActions = document.createElement('div');
    bActions.style.cssText = 'display:flex;align-items:center;';
    var launchBtn = document.createElement('button');
    launchBtn.type = 'button';
    launchBtn.id = 'btn-tv-ucl-launch';
    launchBtn.className = 'tv-btn-primary';
    launchBtn.style.marginRight = '10px';
    launchBtn.tabIndex = 0;
    launchBtn.setAttribute('data-tv-focus-key', 'launch');
    launchBtn.textContent = champTxt(
      selected.length >= 2 ? ('Ver ' + selected.length + ' pantallas ahora') : ('Lanzar (' + selected.length + ')'),
      selected.length >= 2 ? ('Veure ' + selected.length + ' pantalles ara') : ('Llançar (' + selected.length + ')'),
      selected.length >= 2 ? ('Watch ' + selected.length + ' screens now') : ('Launch (' + selected.length + ')')
    );
    launchBtn.onclick = function () { startTvMultiPlayback(selected); };
    bActions.appendChild(launchBtn);

    if (selected.length > 0) {
      var clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'tv-btn';
      clearBtn.tabIndex = 0;
      clearBtn.setAttribute('data-tv-focus-key', 'clear');
      clearBtn.textContent = champTxt('Limpiar', 'Netejar', 'Clear');
      clearBtn.onclick = function () {
        tvChampState.selectedSources = [];
        rerenderChampionsPreservingFocus('launch');
      };
      bActions.appendChild(clearBtn);
    }
    bHead.appendChild(bTitleWrap);
    bHead.appendChild(bActions);
    builder.appendChild(bHead);

    var slotsGrid = document.createElement('div');
    slotsGrid.className = 'tv-ucl-slots-grid';
    for (var sl = 0; sl < MAX_TV_MULTI; sl++) {
      (function (slotIdx) {
        var item = selected[slotIdx] || null;
        var cardWrap = document.createElement('div');
        cardWrap.className = 'tv-ucl-slot-card';
        var inner = document.createElement('div');
        inner.className = 'tv-ucl-slot-inner ' + (item ? 'filled' : 'empty');

        var badge = document.createElement('div');
        badge.className = 'tv-ucl-slot-badge';
        badge.textContent = slotIdx === 0 ? 'P1 · PRINCIPAL' : ('P' + (slotIdx + 1) + ' · SECUNDARIA');
        var nm = document.createElement('div');
        nm.className = 'tv-ucl-slot-name';
        nm.textContent = item ? item.title : champTxt('Ranura libre', 'Espai lliure', 'Empty slot');

        var acts = document.createElement('div');
        acts.className = 'tv-ucl-slot-actions';
        if (item) {
          if (slotIdx > 0) {
            var p1Btn = document.createElement('button');
            p1Btn.type = 'button';
            p1Btn.className = 'tv-ucl-mini-btn active';
            p1Btn.tabIndex = 0;
            p1Btn.setAttribute('data-tv-focus-key', 'slot-p1:' + slotIdx);
            p1Btn.textContent = 'P1';
            p1Btn.onclick = function () { promoteBuilderSlotToFirst(slotIdx); };
            acts.appendChild(p1Btn);
          }
          var delBtn = document.createElement('button');
          delBtn.type = 'button';
          delBtn.className = 'tv-ucl-mini-btn danger';
          delBtn.tabIndex = 0;
          delBtn.setAttribute('data-tv-focus-key', 'slot-del:' + slotIdx);
          delBtn.textContent = champTxt('Quitar', 'Treure', 'Remove');
          delBtn.onclick = function () { toggleBuilderSource(item); };
          acts.appendChild(delBtn);
        }
        inner.appendChild(badge);
        inner.appendChild(nm);
        inner.appendChild(acts);
        cardWrap.appendChild(inner);
        slotsGrid.appendChild(cardWrap);
      })(sl);
    }
    builder.appendChild(slotsGrid);
    container.appendChild(builder);

    if (tvChampState.loading && !tvChampState.loadedOnce) {
      var ld = document.createElement('div');
      ld.style.cssText = 'padding:28px;text-align:center;color:#93c5fd;font-size:17px;font-weight:700;';
      ld.textContent = champTxt('Cargando Champions League y canales MultiChampions...', 'Carregant Champions League i canals MultiChampions...', 'Loading Champions League & MultiChampions feeds...');
      container.appendChild(ld);
      return;
    }

    // Filter row for TV remote
    var activeF = tvChampState.pickerFilter || 'all';
    var fRow = document.createElement('div');
    fRow.className = 'tv-ucl-filter-row';
    var filterOpts = [
      { id: 'all', label: champTxt('Todos', 'Tots', 'All') },
      { id: 'champions', label: 'Champions League' },
      { id: 'live', label: champTxt('En Directo', 'En Directe', 'Live') },
      { id: 'channels', label: champTxt('Canales Multi', 'Canals Multi', 'Multi Channels') }
    ];
    for (var fi = 0; fi < filterOpts.length; fi++) {
      (function (fOpt) {
        var fBtn = document.createElement('button');
        fBtn.type = 'button';
        fBtn.className = 'tv-ucl-mini-btn' + (activeF === fOpt.id ? ' active' : '');
        fBtn.tabIndex = 0;
        fBtn.setAttribute('data-tv-focus-key', 'filter:' + fOpt.id);
        fBtn.textContent = fOpt.label;
        fBtn.onclick = function () {
          tvChampState.pickerFilter = fOpt.id;
          rerenderChampionsPreservingFocus('filter:' + fOpt.id);
        };
        fRow.appendChild(fBtn);
      })(filterOpts[fi]);
    }
    container.appendChild(fRow);

    // 3. Champions & Today Matches (placed right below builder so TV D-Pad reaches matches immediately!)
    var allMatchesRaw = getCombinedMatches();
    var allMatches = [];
    if (activeF !== 'channels') {
      for (var ai = 0; ai < allMatchesRaw.length; ai++) {
        var candM = allMatchesRaw[ai];
        if (!candM) continue;
        if (activeF === 'champions') {
          var hay = ((candM.leagueSlug || '') + ' ' + (candM.leagueName || '') + ' ' + (candM.groupTitle || '')).toLowerCase();
          if (!/champions|uefa\.champions/.test(hay)) continue;
        } else if (activeF === 'live' && candM.statusState !== 'live') {
          continue;
        }
        allMatches.push(candM);
      }
    }

    if (allMatches.length > 0) {
      var mSec = document.createElement('div');
      mSec.className = 'tv-section';
      mSec.innerHTML =
        '<div class="tv-section-head">' +
        '<div class="tv-section-title">' + escapeHtml(champTxt('Elige partidos de Champions y Directos de Hoy', 'Tria partits de Champions i Directes d’Avui', 'Pick Champions & Live Matches Today')) + '</div>' +
        '<div class="tv-section-sub">' + escapeHtml(champTxt('Pulsa + Elegir en 2, 3 o 4 partidos y luego Ver pantallas arriba', 'Prem + Triar en 2, 3 o 4 partits i després Veure pantalles a dalt', 'Press + Pick on 2–4 matches then Watch above')) + '</div>' +
        '</div>';
      var mGrid = document.createElement('div');
      mGrid.className = 'tv-ucl-matches-grid';
      var maxMatches = Math.min(20, allMatches.length);
      for (var mi = 0; mi < maxMatches; mi++) {
        (function (m, mIdx) {
          var src = buildSourceFromMatch(m);
          var slotPos = findSourceInBuilder(src);
          var inMulti = slotPos !== -1;
          var isLiveM = m.statusState === 'live';
          var scoreStr = m.homeScore !== undefined && m.awayScore !== undefined && m.homeScore !== '' && m.awayScore !== ''
            ? (m.homeScore + ' - ' + m.awayScore)
            : (m.kickoffTime || 'Hoy');
          var mKey = String(m.id || mIdx);
          var wrap = document.createElement('div');
          wrap.className = 'tv-ucl-match-wrap';
          var card = document.createElement('div');
          card.className = 'tv-ucl-match-card' + (inMulti ? ' selected' : '');
          card.innerHTML =
            '<div>' +
            '<div class="tv-ucl-match-meta"><span>' + escapeHtml(m.leagueName || m.groupTitle || 'Fútbol') + '</span>' +
            (isLiveM ? '<span class="tv-ucl-live-badge">' + escapeHtml(m.statusDetail || 'EN VIVO') + '</span>' : '<span>' + escapeHtml(m.statusDetail || m.kickoffTime || '') + '</span>') +
            '</div>' +
            '<div class="tv-ucl-teams">' + escapeHtml((m.homeTeam || '') + ' vs ' + (m.awayTeam || '')) + '</div>' +
            '<div class="tv-ucl-score">' + escapeHtml(scoreStr) + '</div>' +
            '</div>';
          var btns = document.createElement('div');
          btns.className = 'tv-ucl-match-btns';

          if (src) {
            var addB = document.createElement('button');
            addB.type = 'button';
            addB.className = 'tv-ucl-mini-btn' + (inMulti ? ' active' : '');
            addB.tabIndex = 0;
            addB.setAttribute('data-tv-focus-key', 'toggle-m:' + mKey);
            addB.textContent = inMulti
              ? champTxt('✓ P' + (slotPos + 1) + ' (Elegido)', '✓ P' + (slotPos + 1) + ' (Triat)', '✓ P' + (slotPos + 1) + ' (Picked)')
              : champTxt('+ Elegir para Multi', '+ Triar per Multi', '+ Pick for Multi');
            addB.onclick = function () { toggleBuilderSource(src); };
            btns.appendChild(addB);
          }

          var playB = document.createElement('button');
          playB.type = 'button';
          playB.className = 'tv-ucl-mini-btn';
          playB.tabIndex = 0;
          playB.setAttribute('data-tv-focus-key', 'play-m:' + mKey);
          playB.textContent = m.channels && m.channels.length ? champTxt('Ver solo', 'Veure sol', 'Watch') : champTxt('Sin señal', 'Sense senyal', 'No feed');
          playB.onclick = function () {
            playSingleMatchOrChannel((m.homeTeam || '') + ' vs ' + (m.awayTeam || ''), m.leagueName || 'UEFA Champions League', m.channels);
          };
          btns.appendChild(playB);

          card.appendChild(btns);
          wrap.appendChild(card);
          mGrid.appendChild(wrap);
        })(allMatches[mi], mi);
      }
      mSec.appendChild(mGrid);
      container.appendChild(mSec);
    }

    // 4. MultiChampions & Sports Channels
    if ((activeF === 'all' || activeF === 'channels') && tvChampState.multiplexChannels.length > 0) {
      var muxSec = document.createElement('div');
      muxSec.className = 'tv-section';
      muxSec.innerHTML =
        '<div class="tv-section-head">' +
        '<div class="tv-section-title">' + escapeHtml(champTxt('Canales MultiChampions y Deportes', 'Canals MultiChampions i Esports', 'MultiChampions & Sports Channels')) + '</div>' +
        '<div class="tv-section-sub">' + escapeHtml(champTxt('Señales 24/7 M+ Liga de Campeones, MultiChampions y DAZN', 'Senyals 24/7 M+ Liga de Campeones, MultiChampions i DAZN', '24/7 M+ Champions, MultiChampions & DAZN streams')) + '</div>' +
        '</div>';
      var muxGrid = document.createElement('div');
      muxGrid.className = 'tv-ucl-matches-grid';
      for (var c = 0; c < tvChampState.multiplexChannels.length; c++) {
        (function (ch, cIdx) {
          var src = buildSourceFromMultiplex(ch, 0);
          var slotPos = findSourceInBuilder(src);
          var inMulti = slotPos !== -1;
          var cKey = String(ch.id || cIdx);
          var wrap = document.createElement('div');
          wrap.className = 'tv-ucl-match-wrap';
          var card = document.createElement('div');
          card.className = 'tv-ucl-match-card' + (inMulti ? ' selected' : '');
          card.innerHTML =
            '<div>' +
            '<div class="tv-ucl-match-meta"><span>' + escapeHtml(ch.network || 'HD') + '</span><span class="tv-ucl-live-badge">LIVE</span></div>' +
            '<div class="tv-ucl-teams">' + escapeHtml(ch.name) + '</div>' +
            '<div class="tv-ucl-score">' + escapeHtml((ch.channels ? ch.channels.length : 0) + ' señales · ' + (ch.quality || '1080p HD')) + '</div>' +
            '</div>';
          var btns = document.createElement('div');
          btns.className = 'tv-ucl-match-btns';

          if (src) {
            var addB = document.createElement('button');
            addB.type = 'button';
            addB.className = 'tv-ucl-mini-btn' + (inMulti ? ' active' : '');
            addB.tabIndex = 0;
            addB.setAttribute('data-tv-focus-key', 'toggle-ch:' + cKey);
            addB.textContent = inMulti
              ? champTxt('✓ P' + (slotPos + 1) + ' (Elegido)', '✓ P' + (slotPos + 1) + ' (Triat)', '✓ P' + (slotPos + 1) + ' (Picked)')
              : champTxt('+ Elegir para Multi', '+ Triar per Multi', '+ Pick for Multi');
            addB.onclick = function () { toggleBuilderSource(src); };
            btns.appendChild(addB);
          }

          var playB = document.createElement('button');
          playB.type = 'button';
          playB.className = 'tv-ucl-mini-btn';
          playB.tabIndex = 0;
          playB.setAttribute('data-tv-focus-key', 'play-ch:' + cKey);
          playB.textContent = champTxt('Ver solo', 'Veure sol', 'Watch');
          playB.onclick = function () {
            playSingleMatchOrChannel(ch.name, ch.network, ch.channels);
          };
          btns.appendChild(playB);

          card.appendChild(btns);
          wrap.appendChild(card);
          muxGrid.appendChild(wrap);
        })(tvChampState.multiplexChannels[c], c);
      }
      muxSec.appendChild(muxGrid);
      container.appendChild(muxSec);
    }

    // 5. UEFA Champions League Standings Table
    if (tvChampState.standings && Array.isArray(tvChampState.standings.groups) && tvChampState.standings.groups.length > 0) {
      var stGroup = tvChampState.standings.groups[0];
      var rows = Array.isArray(stGroup && stGroup.rows) ? stGroup.rows : [];
      if (rows.length > 0) {
        var tSec = document.createElement('div');
        tSec.className = 'tv-section';
        tSec.innerHTML =
          '<div class="tv-section-head">' +
          '<div class="tv-section-title">' + escapeHtml(champTxt('Clasificación UEFA Champions League', 'Classificació UEFA Champions League', 'UEFA Champions League Standings')) + '</div>' +
          '<div class="tv-section-sub">' + escapeHtml((tvChampState.standings.seasonName || '') + (stGroup.groupName ? ' · ' + stGroup.groupName : '')) + '</div>' +
          '</div>';
        var tWrap = document.createElement('div');
        tWrap.className = 'tv-ucl-table-wrap';
        var rowsHtml = '';
        for (var rIdx = 0; rIdx < rows.length; rIdx++) {
          var r = rows[rIdx];
          if (!r) continue;
          rowsHtml +=
            '<tr>' +
            '<td class="num">' + escapeHtml(String(r.rank || (rIdx + 1))) + '</td>' +
            '<td>' + escapeHtml(r.teamName || r.shortName || '') + '</td>' +
            '<td class="num">' + escapeHtml(String(r.played || 0)) + '</td>' +
            '<td class="num">' + escapeHtml(String(r.won || 0) + '-' + String(r.drawn || 0) + '-' + String(r.lost || 0)) + '</td>' +
            '<td class="num">' + escapeHtml(String(r.goalDiff || 0)) + '</td>' +
            '<td class="num" style="color:#6ee7b7;font-weight:900;">' + escapeHtml(String(r.points || 0)) + '</td>' +
            '</tr>';
        }
        tWrap.innerHTML =
          '<table class="tv-ucl-table"><thead><tr>' +
          '<th class="num">#</th>' +
          '<th>' + escapeHtml(champTxt('Equipo', 'Equip', 'Club')) + '</th>' +
          '<th class="num">PJ</th>' +
          '<th class="num">G-E-P</th>' +
          '<th class="num">DG</th>' +
          '<th class="num">PTS</th>' +
          '</tr></thead><tbody>' + rowsHtml + '</tbody></table>';
        tSec.appendChild(tWrap);
        container.appendChild(tSec);
      }
    }
  };

  window.stopTvMultiPlayback = function (silent) {
    stopTvMultiPlaybackInternal(Boolean(silent));
  };

  window.isTvMultiActive = function () {
    return Boolean(tvChampState.multiActive);
  };
})();
