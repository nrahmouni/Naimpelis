// ===================================================================
// SMART TV FOOTBALL MATCHBOARD & SEASON CALENDAR (STRICT ES5)
// ===================================================================
var tvFootballState = {
  dayOffset: 0,
  statusTab: 'all',
  calendarScope: '',
  matches: [],
  loadedKey: '',
  loading: false,
  error: false,
  hasAutoPickedLive: false,
  reqSeq: 0,
  selectedMatch: null,
  focusRestoreSelector: ''
};

var tvFootballRefreshTimer = null;

function fbNormText(raw) {
  var s = String(raw || '').toLowerCase();
  if (s.normalize) {
    try {
      s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    } catch (e) {}
  } else {
    s = s
      .replace(/[áàä]/g, 'a')
      .replace(/[éèë]/g, 'e')
      .replace(/[íìï]/g, 'i')
      .replace(/[óòö]/g, 'o')
      .replace(/[úùü]/g, 'u')
      .replace(/ñ/g, 'n');
  }
  return s.replace(/^\s+|\s+$/g, '');
}

function getTvFootballDateInfo(dayOffset) {
  var d = new Date();
  d.setDate(d.getDate() + (dayOffset || 0));
  var y = d.getFullYear();
  var m = d.getMonth() + 1;
  var day = d.getDate();
  var isoDate = y + '-' + (m < 10 ? '0' + m : String(m)) + '-' + (day < 10 ? '0' + day : String(day));
  try {
    if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
      var madridIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(d);
      if (/^\d{4}-\d{2}-\d{2}$/.test(madridIso)) isoDate = madridIso;
    }
  } catch (e) {}
  var dateKey = isoDate.replace(/-/g, '');
  var label = '';
  if (dayOffset === 0) label = tvT('fbToday');
  else if (dayOffset === -1) label = tvT('fbYesterday');
  else if (dayOffset === 1) label = tvT('fbTomorrow');
  else {
    try {
      var loc = activeTvLang === 'ca' ? 'ca-ES' : (activeTvLang === 'en' ? 'en-US' : 'es-ES');
      label = new Intl.DateTimeFormat(loc, { timeZone: 'Europe/Madrid', weekday: 'short', day: '2-digit', month: 'short' }).format(d);
    } catch (e2) {
      label = isoDate;
    }
  }
  return { dateKey: dateKey, isoDate: isoDate, label: label };
}

function isFbPrioritySpanishMatch(m) {
  if (!m) return false;
  var hay = fbNormText((m.homeTeam || '') + ' ' + (m.awayTeam || ''));
  if (/\b(barcelona|fc barcelona|barca|real madrid)\b/.test(hay)) return true;
  if (/\b(espana|spain|seleccion espanola|la roja)\b/.test(hay) && !/\bespanyol\b/.test(hay)) return true;
  return false;
}

function getFbLeagueRank(m) {
  var slug = fbNormText((m.leagueSlug || '') + ' ' + (m.groupTitle || ''));
  var feat = isFbPrioritySpanishMatch(m) ? 300 : 0;
  if (slug.indexOf('champions') !== -1) return 140 + feat;
  if (slug.indexOf('esp.1') !== -1 || (slug.indexOf('laliga') !== -1 && slug.indexOf('hypermotion') === -1)) return 135 + feat;
  if (slug.indexOf('nations') !== -1 || slug.indexOf('fifa.') !== -1 || slug.indexOf('euro') !== -1 || slug.indexOf('mundial') !== -1) return 125 + feat;
  if (slug.indexOf('eng.1') !== -1 || slug.indexOf('premier') !== -1) return 115 + feat;
  if (slug.indexOf('copa del rey') !== -1 || slug.indexOf('esp.copa') !== -1) return 100 + feat;
  if (slug.indexOf('europa') !== -1) return 85 + feat;
  if (slug.indexOf('esp.2') !== -1 || slug.indexOf('hypermotion') !== -1) return 65 + (feat ? 120 : 0);
  return 20 + feat;
}

function hasFbValidScore(m) {
  if (!m) return false;
  var h = String(m.homeScore === undefined || m.homeScore === null ? '' : m.homeScore).replace(/^\s+|\s+$/g, '');
  var a = String(m.awayScore === undefined || m.awayScore === null ? '' : m.awayScore).replace(/^\s+|\s+$/g, '');
  return /^\d+$/.test(h) && /^\d+$/.test(a);
}

function getSortedFilteredFootballMatches(sourceList, statusOverride) {
  var list = Array.isArray(sourceList) ? sourceList : [];
  var st = statusOverride || tvFootballState.statusTab || 'all';
  var filtered = [];
  var i;
  for (i = 0; i < list.length; i++) {
    var item = list[i];
    if (!item) continue;
    if (st === 'live' && item.statusState !== 'live') continue;
    if (st === 'upcoming' && item.statusState !== 'upcoming') continue;
    filtered.push(item);
  }
  var isTeamCal =
    tvFootballState.calendarScope === 'barca_madrid' ||
    tvFootballState.calendarScope === 'barcelona' ||
    tvFootballState.calendarScope === 'real_madrid' ||
    tvFootballState.calendarScope === 'espana';

  filtered.sort(function (a, b) {
    var stateRank = function (s) { return s === 'live' ? 0 : (s === 'upcoming' ? 1 : 2); };
    var srA = stateRank(a.statusState);
    var srB = stateRank(b.statusState);
    if (srA !== srB) return srA - srB;

    if (isTeamCal) {
      var aMs = Number(a.kickoffMs || 0);
      var bMs = Number(b.kickoffMs || 0);
      if (a.statusState === 'finished') return bMs - aMs;
      if (aMs !== bMs) return aMs - bMs;
      return String(a.kickoffTime || '').localeCompare(String(b.kickoffTime || ''));
    }

    var rankDiff = getFbLeagueRank(b) - getFbLeagueRank(a);
    if (rankDiff !== 0) return rankDiff;
    var aHasEs = a.spanishBroadcaster ? 1 : 0;
    var bHasEs = b.spanishBroadcaster ? 1 : 0;
    if (aHasEs !== bHasEs) return bHasEs - aHasEs;
    return Number(a.kickoffMs || 0) - Number(b.kickoffMs || 0);
  });
  return filtered;
}

function loadTvFootballBoard(silent, focusSelector) {
  var dateInfo = getTvFootballDateInfo(tvFootballState.dayOffset);
  var scope = tvFootballState.calendarScope || '';
  var reqKey = dateInfo.dateKey + ':' + (scope || 'daily') + ':' + activeTvLang;
  var seq = ++tvFootballState.reqSeq;

  if (focusSelector) tvFootballState.focusRestoreSelector = focusSelector;
  if (!silent) {
    tvFootballState.loading = true;
    tvFootballState.error = false;
    if (activeHubTab === 'football' && typeof renderHubContent === 'function') {
      renderHubContent();
    }
  }

  var url = '/api/sports/football-board?date=' + encodeURIComponent(dateInfo.dateKey) + '&lang=' + encodeURIComponent(activeTvLang || 'es');
  if (scope) {
    url += '&calendar=' + encodeURIComponent(scope);
  }

  xhrJson('GET', url, null, function (err, data) {
    if (seq !== tvFootballState.reqSeq) return;
    tvFootballState.loading = false;
    if (err || !data || !Array.isArray(data.matches)) {
      if (!silent) {
        tvFootballState.error = true;
        if (activeHubTab === 'football' && typeof renderHubContent === 'function') {
          renderHubContent();
        }
      }
      return;
    }

    tvFootballState.error = false;
    tvFootballState.matches = data.matches;
    tvFootballState.loadedKey = reqKey;

    if (!tvFootballState.hasAutoPickedLive && !scope && tvFootballState.dayOffset === 0) {
      tvFootballState.hasAutoPickedLive = true;
      var liveCount = 0;
      for (var k = 0; k < data.matches.length; k++) {
        if (data.matches[k] && data.matches[k].statusState === 'live') liveCount++;
      }
      if (liveCount > 0) {
        tvFootballState.statusTab = 'live';
      }
    }

    if (activeHubTab === 'football') {
      if (silent) {
        var activeEl = document.activeElement;
        if (activeEl && hubDynamicContent && hubDynamicContent.contains(activeEl)) {
          return;
        }
      }
      if (typeof renderHubContent === 'function') renderHubContent();
    } else if (activeHubTab === 'home' && !silent && typeof renderProgressiveIfSafe === 'function') {
      renderProgressiveIfSafe(false);
    }
  });
}

function getFallbackSportsChannelsForMatch() {
  var all = catalogData && Array.isArray(catalogData.tdt) ? catalogData.tdt : [];
  var picks = [];
  for (var i = 0; i < all.length; i++) {
    var c = all[i];
    if (!c || !c.channels || !c.channels.length) continue;
    if (c.category === 'dazn' || c.category === 'movistar' || c.id === 'tdt-teledeporte' || c.id === 'tdt-la1') {
      picks.push(c);
      if (picks.length >= 6) break;
    }
  }
  return picks;
}

function playFootballMatchChannelOnTv(match, trackIndex) {
  if (!match || !match.channels || !match.channels.length) return;
  closeTvFootballModal();
  unlockAudio();
  var adaptedChannel = {
    id: match.id || ('fb-' + (match.eventId || 'match')),
    name: (match.homeTeam || 'Local') + ' vs ' + (match.awayTeam || 'Visitante'),
    network: match.leagueName || match.groupTitle || 'Fútbol HD',
    logoUrl: match.homeLogo || match.leagueLogoUrl || '',
    category: 'dazn',
    description: (match.groupTitle || '') + (match.kickoffTime ? ' · ' + match.kickoffTime : ''),
    channels: match.channels
  };
  playTdtChannelOnTv(adaptedChannel, typeof trackIndex === 'number' ? trackIndex : 0, false);
}

function closeTvFootballModal() {
  var modal = document.getElementById('tv-football-modal');
  if (modal) modal.style.display = 'none';
  tvFootballState.selectedMatch = null;
  if (lastHubFocusedEl && lastHubFocusedEl.focus) {
    setTimeout(function () {
      try { lastHubFocusedEl.focus(); } catch (e) {}
    }, 30);
  }
}

function loadFootballModalDetailsInto(match, boxEl) {
  if (!match || !boxEl) return;
  var dateInfo = getTvFootballDateInfo(tvFootballState.dayOffset);
  var q =
    'eventId=' + encodeURIComponent(match.eventId || '') +
    '&leagueSlug=' + encodeURIComponent(match.leagueSlug || 'all') +
    '&homeTeam=' + encodeURIComponent(match.homeTeam || '') +
    '&awayTeam=' + encodeURIComponent(match.awayTeam || '') +
    '&date=' + encodeURIComponent(dateInfo.dateKey);
  if (match.fotmobMatchId) q += '&fotmobMatchId=' + encodeURIComponent(match.fotmobMatchId);

  xhrJson('GET', '/api/sports/match-details?' + q, null, function (err, res) {
    if (err || !res || !res.details || tvFootballState.selectedMatch !== match) return;
    var det = res.details;
    var events = Array.isArray(det.events) ? det.events : [];
    if (!events.length) {
      boxEl.innerHTML = '';
      return;
    }
    var html = '<div class="tv-fb-modal-sec-title">' + escapeHtml(tvT('fbEventsTitle')) + '</div><div class="tv-fb-events-list">';
    var limit = Math.min(8, events.length);
    for (var i = 0; i < limit; i++) {
      var ev = events[i];
      var evTxt = (ev.minute ? ev.minute + "' · " : '') + (ev.player || ev.detail || ev.type || '') + (ev.teamName ? ' (' + ev.teamName + ')' : '');
      html += '<div class="tv-fb-event-chip">' + escapeHtml(evTxt) + '</div>';
    }
    html += '</div>';
    boxEl.innerHTML = html;
  });
}

function openTvFootballMatchModal(match) {
  if (!match) return;
  var modal = document.getElementById('tv-football-modal');
  if (!modal) return;
  tvFootballState.selectedMatch = match;

  var leagueEl = document.getElementById('fbm-league');
  var boardEl = document.getElementById('fbm-scoreboard');
  var sigTitleEl = document.getElementById('fbm-signals-title');
  var sigListEl = document.getElementById('fbm-signals-list');
  var eventsBoxEl = document.getElementById('fbm-events-box');

  if (leagueEl) {
    var metaParts = [];
    if (match.leagueName || match.groupTitle) metaParts.push(match.leagueName || match.groupTitle);
    if (match.kickoffDateLabel) metaParts.push(match.kickoffDateLabel);
    if (match.kickoffTime) metaParts.push(match.kickoffTime);
    leagueEl.textContent = metaParts.join(' · ');
  }

  if (boardEl) {
    var scoreValid = hasFbValidScore(match);
    var centerText = scoreValid ? (match.homeScore + ' - ' + match.awayScore) : (match.kickoffTime || 'VS');
    var statusText = match.statusState === 'live'
      ? (match.statusLabel || tvT('liveNow'))
      : (match.statusState === 'finished' ? (match.statusLabel || tvT('fbFinished')) : (match.kickoffDateLabel || tvT('fbUpcoming')));

    var homeCrest = match.homeLogo
      ? '<img class="tv-fb-modal-crest" src="' + escapeHtml(match.homeLogo) + '" alt="" referrerpolicy="no-referrer" onerror="this.style.display=\'none\';" />'
      : '<div class="tv-fb-modal-crest-fb">' + escapeHtml(match.homeShort || 'LOC') + '</div>';
    var awayCrest = match.awayLogo
      ? '<img class="tv-fb-modal-crest" src="' + escapeHtml(match.awayLogo) + '" alt="" referrerpolicy="no-referrer" onerror="this.style.display=\'none\';" />'
      : '<div class="tv-fb-modal-crest-fb">' + escapeHtml(match.awayShort || 'VIS') + '</div>';

    boardEl.innerHTML =
      '<div class="tv-fb-modal-team">' + homeCrest + '<div class="tv-fb-modal-team-name">' + escapeHtml(match.homeTeam) + '</div></div>' +
      '<div class="tv-fb-modal-center">' +
      '<div class="tv-fb-modal-score">' + escapeHtml(centerText) + '</div>' +
      '<div class="tv-fb-modal-status' + (match.statusState === 'live' ? ' is-live' : '') + '">' + escapeHtml(statusText) + '</div>' +
      '</div>' +
      '<div class="tv-fb-modal-team">' + awayCrest + '<div class="tv-fb-modal-team-name">' + escapeHtml(match.awayTeam) + '</div></div>';
  }

  if (sigTitleEl) sigTitleEl.textContent = tvT('fbSignalsTitle');
  if (sigListEl) {
    sigListEl.innerHTML = '';
    var chs = Array.isArray(match.channels) ? match.channels : [];
    if (chs.length > 0) {
      for (var c = 0; c < chs.length; c++) {
        (function (tr, idx) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'tv-btn-primary tv-fb-signal-btn' + (idx === 0 ? ' accent-purple' : '');
          b.tabIndex = 0;
          var lbl = tr.label || ('Señal ' + (idx + 1));
          b.textContent = (idx + 1) + '. ' + lbl + (tr.quality ? ' · ' + tr.quality : '');
          b.onclick = function () {
            playFootballMatchChannelOnTv(match, idx);
          };
          sigListEl.appendChild(b);
        })(chs[c], c);
      }
    } else {
      var noSig = document.createElement('div');
      noSig.className = 'tv-fb-no-signals';
      noSig.textContent = tvT('fbNoSignals');
      sigListEl.appendChild(noSig);

      var fallbacks = getFallbackSportsChannelsForMatch();
      for (var fb = 0; fb < fallbacks.length; fb++) {
        (function (fCh) {
          var b2 = document.createElement('button');
          b2.type = 'button';
          b2.className = 'tv-btn tv-fb-signal-btn';
          b2.tabIndex = 0;
          b2.textContent = fCh.name;
          b2.onclick = function () {
            closeTvFootballModal();
            unlockAudio();
            playTdtChannelOnTv(fCh, 0, false);
          };
          sigListEl.appendChild(b2);
        })(fallbacks[fb]);
      }
    }
  }

  if (eventsBoxEl) {
    eventsBoxEl.innerHTML = '';
    if (match.statusState !== 'upcoming') {
      loadFootballModalDetailsInto(match, eventsBoxEl);
    }
  }

  modal.style.display = 'block';
  setTimeout(function () {
    var firstSig = modal.querySelector('.tv-fb-signal-btn') || document.getElementById('btn-close-football-modal');
    if (firstSig && firstSig.focus) firstSig.focus();
  }, 40);
}

function buildTvFootballCard(match, isRailCompact) {
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = isRailCompact ? 'tv-fb-card compact' : 'tv-fb-card';
  btn.tabIndex = 0;
  btn.setAttribute('data-fb-match-id', match.id || '');

  var isLive = match.statusState === 'live';
  var isFin = match.statusState === 'finished';
  var scoreValid = hasFbValidScore(match);
  var centerMain = scoreValid ? (match.homeScore + ' - ' + match.awayScore) : (match.kickoffTime || 'VS');
  var statusLabel = isLive
    ? (match.statusLabel || tvT('liveNow'))
    : (isFin ? (match.statusLabel || tvT('fbFinished')) : (match.kickoffTime || tvT('fbUpcoming')));

  var topMeta = (match.leagueName || match.groupTitle || 'Fútbol');
  if (match.kickoffDateLabel && (tvFootballState.calendarScope || match.kickoffDateLabel !== tvT('fbToday'))) {
    topMeta = match.kickoffDateLabel + ' · ' + topMeta;
  }

  var broadcasterLabel = '';
  if (match.spanishBroadcaster && match.spanishBroadcaster.name) {
    broadcasterLabel = match.spanishBroadcaster.name;
  } else if (match.channels && match.channels[0] && match.channels[0].label) {
    broadcasterLabel = match.channels[0].label;
  } else {
    broadcasterLabel = tvT('fbWatchLive');
  }

  var homeCrest = match.homeLogo
    ? '<img class="tv-fb-crest" src="' + escapeHtml(match.homeLogo) + '" alt="" referrerpolicy="no-referrer" onerror="this.style.display=\'none\';" />'
    : '<span class="tv-fb-crest-fb">' + escapeHtml(match.homeShort || 'LOC') + '</span>';
  var awayCrest = match.awayLogo
    ? '<img class="tv-fb-crest" src="' + escapeHtml(match.awayLogo) + '" alt="" referrerpolicy="no-referrer" onerror="this.style.display=\'none\';" />'
    : '<span class="tv-fb-crest-fb">' + escapeHtml(match.awayShort || 'VIS') + '</span>';

  btn.innerHTML =
    '<div class="tv-fb-card-top">' +
    '<span class="tv-fb-league">' + escapeHtml(topMeta) + '</span>' +
    '<span class="tv-fb-status' + (isLive ? ' is-live' : (isFin ? ' is-fin' : '')) + '">' + escapeHtml(statusLabel) + '</span>' +
    '</div>' +
    '<div class="tv-fb-teams-row">' +
    '<div class="tv-fb-team-col">' + homeCrest + '<div class="tv-fb-team-name">' + escapeHtml(match.homeTeam) + '</div></div>' +
    '<div class="tv-fb-score-box">' + escapeHtml(centerMain) + '</div>' +
    '<div class="tv-fb-team-col">' + awayCrest + '<div class="tv-fb-team-name">' + escapeHtml(match.awayTeam) + '</div></div>' +
    '</div>' +
    '<div class="tv-fb-card-foot">' +
    '<span class="tv-fb-tv-badge">' + escapeHtml(broadcasterLabel) + '</span>' +
    '<span class="tv-fb-action-hint">OK</span>' +
    '</div>';

  btn.onclick = function () {
    lastHubFocusedEl = btn;
    openTvFootballMatchModal(match);
  };
  return btn;
}

function renderTvFootballHubInto(container) {
  if (!container) return;
  var dateInfo = getTvFootballDateInfo(tvFootballState.dayOffset);
  var expectedKey = dateInfo.dateKey + ':' + (tvFootballState.calendarScope || 'daily') + ':' + activeTvLang;

  if (!tvFootballState.loading && tvFootballState.loadedKey !== expectedKey && !tvFootballState.error) {
    loadTvFootballBoard(false);
  }

  // Row 1: Status Tabs + Calendar Date Controls (ALL in ONE single horizontal row)
  var row1 = document.createElement('div');
  row1.className = 'tv-fb-controls-row';

  var statusDefs = [
    { key: 'live', label: tvT('fbLiveNow') },
    { key: 'upcoming', label: tvT('fbUpcoming') },
    { key: 'all', label: tvT('fbAll') }
  ];
  for (var s = 0; s < statusDefs.length; s++) {
    (function (sd) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tv-filter-pill' + (tvFootballState.statusTab === sd.key ? ' active' : '');
      b.tabIndex = 0;
      b.setAttribute('data-fb-status', sd.key);
      b.textContent = sd.label;
      b.onclick = function () {
        tvFootballState.statusTab = sd.key;
        tvFootballState.focusRestoreSelector = '.tv-filter-pill[data-fb-status="' + sd.key + '"]';
        renderHubContent();
      };
      row1.appendChild(b);
    })(statusDefs[s]);
  }

  if (tvFootballState.calendarScope) {
    var backTodayBtn = document.createElement('button');
    backTodayBtn.type = 'button';
    backTodayBtn.className = 'tv-filter-pill tv-fb-date-pill active';
    backTodayBtn.tabIndex = 0;
    backTodayBtn.setAttribute('data-fb-nav', 'back-today');
    backTodayBtn.textContent = tvT('fbBackToday');
    backTodayBtn.onclick = function () {
      tvFootballState.calendarScope = '';
      tvFootballState.dayOffset = 0;
      loadTvFootballBoard(false, '.tv-filter-pill[data-fb-scope=""]');
    };
    row1.appendChild(backTodayBtn);
  } else {
    var prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'tv-filter-pill tv-fb-date-pill';
    prevBtn.tabIndex = 0;
    prevBtn.setAttribute('data-fb-nav', 'prev');
    prevBtn.textContent = '◀ ' + tvT('fbPrevDay');
    prevBtn.onclick = function () {
      tvFootballState.dayOffset = Math.max(-30, tvFootballState.dayOffset - 1);
      tvFootballState.statusTab = 'all';
      loadTvFootballBoard(false, '.tv-filter-pill[data-fb-nav="prev"]');
    };
    row1.appendChild(prevBtn);

    var curDateBtn = document.createElement('button');
    curDateBtn.type = 'button';
    curDateBtn.className = 'tv-filter-pill tv-fb-date-pill' + (tvFootballState.dayOffset === 0 ? ' active' : '');
    curDateBtn.tabIndex = 0;
    curDateBtn.setAttribute('data-fb-nav', 'today');
    curDateBtn.textContent = dateInfo.label;
    curDateBtn.onclick = function () {
      tvFootballState.dayOffset = 0;
      loadTvFootballBoard(false, '.tv-filter-pill[data-fb-nav="today"]');
    };
    row1.appendChild(curDateBtn);

    var nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'tv-filter-pill tv-fb-date-pill';
    nextBtn.tabIndex = 0;
    nextBtn.setAttribute('data-fb-nav', 'next');
    nextBtn.textContent = tvT('fbNextDay') + ' ▶';
    nextBtn.onclick = function () {
      tvFootballState.dayOffset = Math.min(365, tvFootballState.dayOffset + 1);
      tvFootballState.statusTab = 'all';
      loadTvFootballBoard(false, '.tv-filter-pill[data-fb-nav="next"]');
    };
    row1.appendChild(nextBtn);
  }
  container.appendChild(row1);

  // Row 2: Team & Competition Calendar Scopes (ONE single horizontal scrollable strip, zero wrapping)
  var scopeDefs = [
    { key: '', label: tvT('fbScopeDaily') },
    { key: 'barca_madrid', label: tvT('fbScopeBarcaMadrid') },
    { key: 'barcelona', label: tvT('fbScopeBarca') },
    { key: 'real_madrid', label: tvT('fbScopeMadrid') },
    { key: 'espana', label: tvT('fbScopeSpain') },
    { key: 'laliga', label: 'LaLiga' },
    { key: 'champions', label: 'Champions' },
    { key: 'premier', label: 'Premier' },
    { key: 'hypermotion', label: 'Hypermotion' },
    { key: 'world', label: tvT('fbScopeWorld') }
  ];
  var row2 = document.createElement('div');
  row2.className = 'tv-filter-row';
  for (var sc = 0; sc < scopeDefs.length; sc++) {
    (function (scDef) {
      var sb = document.createElement('button');
      sb.type = 'button';
      sb.className = 'tv-filter-pill' + (tvFootballState.calendarScope === scDef.key ? ' active' : '');
      sb.tabIndex = 0;
      sb.setAttribute('data-fb-scope', scDef.key);
      sb.textContent = scDef.label;
      sb.onclick = function () {
        tvFootballState.calendarScope = scDef.key;
        if (scDef.key) {
          tvFootballState.statusTab = 'all';
        }
        loadTvFootballBoard(false, '.tv-filter-pill[data-fb-scope="' + scDef.key + '"]');
      };
      row2.appendChild(sb);
    })(scopeDefs[sc]);
  }
  container.appendChild(row2);

  if (tvFootballState.calendarScope) {
    var calBanner = document.createElement('div');
    calBanner.className = 'tv-fb-cal-banner';
    calBanner.textContent = tvT('fbCalendarBanner');
    container.appendChild(calBanner);
  }

  if (tvFootballState.loading && tvFootballState.loadedKey !== expectedKey) {
    var ldBox = document.createElement('div');
    ldBox.className = 'hub-loading-state';
    ldBox.innerHTML = '<div class="tv-spinner"></div><div>' + escapeHtml(tvT('fbLoading')) + '</div>';
    container.appendChild(ldBox);
    restoreTvFootballFocus(container);
    return;
  }

  if (tvFootballState.error && !tvFootballState.matches.length) {
    var errBox = document.createElement('div');
    errBox.className = 'tv-fb-empty-box';
    errBox.innerHTML = '<div class="tv-fb-empty-text">' + escapeHtml(tvT('fbError')) + '</div>';
    var retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'tv-btn-primary accent-purple';
    retryBtn.tabIndex = 0;
    retryBtn.textContent = tvT('fbRetry');
    retryBtn.onclick = function () { loadTvFootballBoard(false); };
    errBox.appendChild(retryBtn);
    container.appendChild(errBox);
    restoreTvFootballFocus(container);
    return;
  }

  var visibleMatches = getSortedFilteredFootballMatches(tvFootballState.matches);
  if (!visibleMatches.length) {
    var emptyBox = document.createElement('div');
    emptyBox.className = 'tv-fb-empty-box';
    var emptyMsg = tvFootballState.statusTab === 'live' ? tvT('fbNoLive') : tvT('fbNoMatches');
    emptyBox.innerHTML = '<div class="tv-fb-empty-text">' + escapeHtml(emptyMsg) + '</div>';
    if (tvFootballState.statusTab !== 'all' && tvFootballState.matches.length > 0) {
      var allBtn = document.createElement('button');
      allBtn.type = 'button';
      allBtn.className = 'tv-btn-primary accent-purple';
      allBtn.tabIndex = 0;
      allBtn.textContent = tvT('fbShowAll');
      allBtn.onclick = function () {
        tvFootballState.statusTab = 'all';
        renderHubContent();
      };
      emptyBox.appendChild(allBtn);
    }
    container.appendChild(emptyBox);
  } else {
    var grid = document.createElement('div');
    grid.className = 'tv-fb-grid';
    var maxItems = Math.min(48, visibleMatches.length);
    var frag = document.createDocumentFragment();
    for (var m = 0; m < maxItems; m++) {
      frag.appendChild(buildTvFootballCard(visibleMatches[m], false));
    }
    grid.appendChild(frag);
    container.appendChild(grid);
  }

  // 24/7 Sports Channels quick row below matches
  var ch247 = getFallbackSportsChannelsForMatch();
  if (ch247.length > 0 && typeof appendSection === 'function') {
    appendSection(container, tvT('fbChannels247'), 'DAZN · Movistar+ · Teledeporte', ch247, 'tdt', false);
  }

  restoreTvFootballFocus(container);
}

function restoreTvFootballFocus(container) {
  if (!tvFootballState.focusRestoreSelector) return;
  var sel = tvFootballState.focusRestoreSelector;
  tvFootballState.focusRestoreSelector = '';
  setTimeout(function () {
    var target = container ? container.querySelector(sel) : null;
    if (target && target.focus) {
      try { target.focus(); } catch (e) {}
    }
  }, 20);
}

function renderTvFootballHomeStripInto(container) {
  if (!container) return;
  if (!tvFootballState.loadedKey && !tvFootballState.loading) {
    loadTvFootballBoard(true);
    return;
  }
  var picks = getSortedFilteredFootballMatches(tvFootballState.matches, 'all');
  if (!picks.length) return;

  var sec = document.createElement('div');
  sec.className = 'tv-section';
  var head = document.createElement('div');
  head.className = 'tv-section-head';
  head.innerHTML =
    '<div class="tv-section-title">' + escapeHtml(tvT('fbHomeStripTitle')) + '</div>' +
    '<div class="tv-section-sub">' + escapeHtml(tvT('fbHomeStripSub')) + '</div>';
  sec.appendChild(head);

  var rail = document.createElement('div');
  rail.className = 'tv-rail';
  var frag = document.createDocumentFragment();
  var limit = Math.min(6, picks.length);
  for (var i = 0; i < limit; i++) {
    frag.appendChild(buildTvFootballCard(picks[i], true));
  }

  var moreCard = document.createElement('button');
  moreCard.type = 'button';
  moreCard.className = 'tv-fb-card compact tv-fb-more-card';
  moreCard.tabIndex = 0;
  moreCard.innerHTML =
    '<div class="tv-fb-more-title">' + escapeHtml(tvT('fbOpenFullCal')) + '</div>' +
    '<div class="tv-fb-more-sub">' + escapeHtml(tvT('fbScopeBarcaMadrid')) + ' · LaLiga · Champions</div>';
  moreCard.onclick = function () {
    selectHubTabProgrammatic('football');
  };
  frag.appendChild(moreCard);

  rail.appendChild(frag);
  sec.appendChild(rail);
  container.appendChild(sec);
}

setTimeout(function () {
  var closeFbBtn = document.getElementById('btn-close-football-modal');
  if (closeFbBtn) {
    closeFbBtn.onclick = closeTvFootballModal;
  }
}, 0);

if (!tvFootballRefreshTimer) {
  tvFootballRefreshTimer = setInterval(function () {
    if (activeScreen === 'hub' && activeHubTab === 'football') {
      var modal = document.getElementById('tv-football-modal');
      if (!modal || modal.style.display !== 'block') {
        loadTvFootballBoard(true);
      }
    }
  }, 30000);
}
