// ===================================================================
// TV v2 10-FOOT BROADCAST HUB, RESUME CHANNEL, LIVE TDT/DAZN & SEARCH (ES5)
// ===================================================================
var TV_TDT_SNAP_KEY = 'naim_tv_tdt_snap_v2';
var tvLiveFilterDebounce = null;
var tvSearchDebounce = null;
var tvProgressiveRenderTimer = null;

var SVG_ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>';
var SVG_ICON_TV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="14" rx="2"/><polyline points="8 2 12 6 16 2"/></svg>';
var SVG_ICON_SPORTS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polygon points="12 7 16 10 14.5 15 9.5 15 8 10 12 7"/></svg>';
var SVG_ICON_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="20" y1="20" x2="16.2" y2="16.2"/></svg>';
var SVG_ICON_PHONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2" width="10" height="20" rx="2"/><line x1="11" y1="18" x2="13" y2="18"/></svg>';

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getChannelBrandGradient(ch) {
  var id = String(ch.id || '').toLowerCase();
  var cat = String(ch.category || '').toLowerCase();
  if (id === 'tdt-la1' || id === 'tdt-24h') return 'linear-gradient(135deg, #0055b8 0%, #091834 100%)';
  if (id === 'tdt-la2') return 'linear-gradient(135deg, #027c8c 0%, #091f28 100%)';
  if (id === 'tdt-antena3' || id === 'tdt-neox' || id === 'tdt-mega') return 'linear-gradient(135deg, #d94e0f 0%, #2a120a 100%)';
  if (id === 'tdt-cuatro') return 'linear-gradient(135deg, #c81938 0%, #240912 100%)';
  if (id === 'tdt-telecinco' || id === 'tdt-fdf') return 'linear-gradient(135deg, #0284c7 0%, #0a192e 100%)';
  if (id === 'tdt-lasexta') return 'linear-gradient(135deg, #059669 0%, #092119 100%)';
  if (cat === 'movistar') return 'linear-gradient(135deg, #0077b6 0%, #091324 100%)';
  if (cat === 'dazn') return 'linear-gradient(135deg, #27272f 0%, #09090d 100%)';
  if (cat === 'bein_arabic') return 'linear-gradient(135deg, #5b21b6 0%, #140b24 100%)';
  if (cat === 'marruecos') return 'linear-gradient(135deg, #b91c1c 0%, #142b1d 100%)';
  if (cat === 'documentales') return 'linear-gradient(135deg, #b45309 0%, #1c1406 100%)';
  if (cat === 'usa_tv') return 'linear-gradient(135deg, #1d4ed8 0%, #180d22 100%)';
  if (cat === 'europa_tv') return 'linear-gradient(135deg, #0f766e 0%, #0c1726 100%)';
  if (cat === 'noticias_intl') return 'linear-gradient(135deg, #d97706 0%, #1c130a 100%)';
  if (cat === 'uk_sports') return 'linear-gradient(135deg, #1d4ed8 0%, #3b0a24 100%)';
  if (cat === 'china_football') return 'linear-gradient(135deg, #be123c 0%, #1f0a12 100%)';
  if (cat === 'espn' || cat === 'dsports' || cat === 'beinsports') return 'linear-gradient(135deg, #991b1b 0%, #160a0d 100%)';
  if (cat === 'cine_series' || cat === 'tnt_space') return 'linear-gradient(135deg, #6d28d9 0%, #160e26 100%)';
  if (cat === 'infantil_autonomicas') return 'linear-gradient(135deg, #0f766e 0%, #0e1d20 100%)';
  return 'linear-gradient(135deg, #3b2472 0%, #121218 100%)';
}

var SVG_ICON_KIDS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4 4 0 0 0 7 0"/><line x1="9" y1="9.5" x2="9.01" y2="9.5"/><line x1="15" y1="9.5" x2="15.01" y2="9.5"/></svg>';
var SVG_ICON_GAMES = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="4"/><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><circle cx="15.5" cy="10.5" r="1"/><circle cx="17.5" cy="13" r="1"/></svg>';

function isSpanishKidsChannel(ch) {
  if (!ch) return false;
  var id = String(ch.id || '').toLowerCase();
  if (id === 'tdt-clan' || id === 'tdt-boing') return true;
  var name = String(ch.name || '').toLowerCase();
  var net = String(ch.network || '').toLowerCase();
  if (/clan|boing|disney\s*(?:channel|jr|junior)|nickelodeon|nick\s*jr|canal\s*panda|babytv/i.test(name + ' ' + net)) {
    var lang = String(ch.lang || ch.langCode || '').toUpperCase();
    var cCode = String(ch.countryCode || '').toLowerCase();
    if (!lang || lang === 'ES' || cCode === 'es' || id.indexOf('tdt-') === 0) return true;
  }
  return false;
}

function isExcludedKidsChannel(ch) {
  if (!ch) return false;
  var cat = String(ch.category || '').toLowerCase();
  if (cat === 'kids_world' && !isSpanishKidsChannel(ch)) return true;
  return false;
}

function getChannelPriorityRank(ch) {
  var id = String(ch.id || '').toLowerCase();
  var cat = String(ch.category || '').toLowerCase();
  var flagshipIds = {
    'tdt-la1': 1,
    'tdt-la2': 2,
    'tdt-antena3': 3,
    'tdt-cuatro': 4,
    'tdt-telecinco': 5,
    'tdt-lasexta': 6,
    'dazn-laliga': 7,
    'mplus-laliga': 8,
    'mplus-canal': 9,
    'mplus-champions': 10,
    'dazn-1': 11,
    'dazn-2': 12,
    'dazn-f1': 13,
    'mplus-vamos': 14,
    'mplus-hypermotion': 15,
    'tdt-teledeporte': 16,
    'tdt-24h': 17,
    'tdt-neox': 18,
    'tdt-nova': 19,
    'tdt-mega': 20,
    'tdt-atreseries': 21,
    'tdt-fdf': 22,
    'tdt-divinity': 23,
    'tdt-energy': 24,
    'tdt-bemad': 25
  };
  if (flagshipIds[id]) return flagshipIds[id];
  if (cat === 'generalistas') return 30 + (ch.dial || 50);
  if (cat === 'dazn') return 60 + (ch.dial || 50);
  if (cat === 'movistar') return 80 + (ch.dial || 50);
  if (cat === 'noticias_deportes') return 140 + (ch.dial || 50);
  if (cat === 'entretenimiento') return 170 + (ch.dial || 50);
  if (cat === 'cine_series') return 210 + (ch.dial || 50);
  if (cat === 'documentales') return 250 + (ch.dial || 50);
  if (cat === 'infantil_autonomicas') return 280 + (ch.dial || 50);
  return 500 + (ch.dial || 99);
}

function mergeTvLiveCatalog() {
  var base = Array.isArray(catalogData.tdtBase) ? catalogData.tdtBase : [];
  var world = Array.isArray(catalogData.worldTv) ? catalogData.worldTv : [];
  var merged = [];
  var seen = {};
  var i;
  for (i = 0; i < base.length; i++) {
    if (base[i] && base[i].id && !seen[base[i].id] && !isExcludedKidsChannel(base[i])) {
      seen[base[i].id] = true;
      merged.push(base[i]);
    }
  }
  // Keep Smart TV boot list super fast: only merge up to 120 priority world channels
  var worldAdded = 0;
  for (i = 0; i < world.length && worldAdded < 120; i++) {
    if (world[i] && world[i].id && !seen[world[i].id] && !isExcludedKidsChannel(world[i])) {
      seen[world[i].id] = true;
      merged.push(world[i]);
      worldAdded++;
    }
  }
  merged.sort(function (a, b) {
    return getChannelPriorityRank(a) - getChannelPriorityRank(b);
  });
  catalogData.tdt = merged;
}

function channelMatchesCategoryFilter(c, filterKey) {
  if (!filterKey || filterKey === 'all') return true;
  var cat = c.category || '';
  if (filterKey === 'es_priority') {
    return cat === 'generalistas' || cat === 'noticias_deportes' || cat === 'entretenimiento' || cat === 'dazn' || cat === 'movistar' || cat === 'cine_series' || cat === 'documentales' || cat === 'infantil_autonomicas';
  }
  if (filterKey === 'es_tdt') {
    return cat === 'generalistas' || cat === 'noticias_deportes' || cat === 'entretenimiento';
  }
  if (filterKey === 'es_sports') return cat === 'dazn' || cat === 'movistar';
  if (filterKey === 'es_docs_cine') return cat === 'cine_series' || cat === 'documentales';
  if (filterKey === 'es_regional') return cat === 'infantil_autonomicas';
  if (filterKey === 'world_cricket') return cat === 'world_cricket';
  if (filterKey === 'bein_arabic') return cat === 'bein_arabic';
  if (filterKey === 'marruecos') return cat === 'marruecos';
  if (filterKey === 'elahmad_mena') return cat === 'elahmad_mena';
  if (filterKey === 'adrar_europa') {
    if (cat !== 'adrar_europa') return false;
    if (activeAdrarCountry && activeAdrarCountry !== 'all') {
      return String(c.countryCode || '').toLowerCase() === activeAdrarCountry;
    }
    return true;
  }
  if (filterKey === 'documentales') return cat === 'documentales';
  if (filterKey === 'usa_tv') return cat === 'usa_tv';
  if (filterKey === 'europa_tv') return cat === 'europa_tv';
  if (filterKey === 'noticias_intl') return cat === 'noticias_intl';
  if (filterKey === 'uk_sports') return cat === 'uk_sports';
  if (filterKey === 'china_football') return cat === 'china_football';
  if (filterKey === 'intl_sports') return cat === 'espn' || cat === 'dsports' || cat === 'beinsports' || cat === 'tnt_space';
  if (filterKey === 'cine') return cat === 'cine_series';
  if (filterKey === 'famelack_movies') return cat === 'famelack_movies';
  return cat === filterKey;
}

function filterTdtChannels(filterKey, overrideQuery) {
  var isEsOnly =
    !overrideQuery &&
    !activeLiveSearch &&
    (filterKey === 'es_priority' ||
      filterKey === 'es_tdt' ||
      filterKey === 'es_sports' ||
      filterKey === 'es_docs_cine' ||
      filterKey === 'es_regional');
  var all = isEsOnly && catalogData.tdtBase && catalogData.tdtBase.length
    ? catalogData.tdtBase
    : ((filterKey === 'all' || overrideQuery || activeLiveSearch || !isEsOnly) && catalogData.worldTv && catalogData.worldTv.length
        ? (catalogData.tdtBase || []).concat(catalogData.worldTv)
        : (catalogData.tdt || []));
  var rawQ = overrideQuery !== undefined ? overrideQuery : activeLiveSearch;
  var q = String(rawQ || '').replace(/^\s+|\s+$/g, '').toLowerCase();
  var out = [];
  var seenIds = {};
  var cap = q ? 80 : 180;
  for (var i = 0; i < all.length; i++) {
    var c = all[i];
    if (!c || !c.id || seenIds[c.id]) continue;
    if (!channelMatchesCategoryFilter(c, filterKey)) continue;
    if (q) {
      var chEpg = catalogData.epg ? catalogData.epg[c.id] : null;
      var epgTitle = chEpg && chEpg.now && chEpg.now.title ? chEpg.now.title.toLowerCase() : '';
      var hay =
        (c.name ? c.name.toLowerCase() : '') + ' ' +
        (c.network ? c.network.toLowerCase() : '') + ' ' +
        (c.dial ? String(c.dial) : '') + ' ' +
        (c.category ? String(c.category).toLowerCase() : '') + ' ' +
        (c.countryCode ? String(c.countryCode).toLowerCase() : '') + ' ' +
        epgTitle;
      if (hay.indexOf(q) === -1) continue;
    }
    seenIds[c.id] = true;
    out.push(c);
    if (out.length >= cap) break;
  }
  return out;
}

function buildCardButton(item, kind) {
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = kind === 'tdt' ? 'tv-card channel-card' : 'tv-card';
  btn.tabIndex = 0;

  if (kind === 'tdt') {
    btn.setAttribute('data-tdt-id', item.id);
    var dialText = item.dial ? tvT('dialPrefix') + item.dial : (item.network || tvT('liveNow'));
    var grad = getChannelBrandGradient(item);
    var chEpg = catalogData.epg ? catalogData.epg[item.id] : null;
    var nowTitle = chEpg && chEpg.now ? chEpg.now.title : (item.network || tvT('broadcast247'));
    var pct = chEpg && typeof chEpg.progressPct === 'number' ? Math.max(6, Math.min(100, chEpg.progressPct)) : 35;
    var logoHtml = item.logoUrl
      ? '<img class="tv-channel-logo-img" src="' + escapeHtml(item.logoUrl) + '" alt="' + escapeHtml(item.name || 'TV') + '" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display=\'none\';if(this.nextSibling)this.nextSibling.style.display=\'block\';" /><div class="tv-channel-mark" style="display:none;">' + escapeHtml(item.shortMark || item.name || 'TV') + '</div>'
      : '<div class="tv-channel-mark">' + escapeHtml(item.shortMark || item.name || 'TV') + '</div>';

    btn.innerHTML =
      '<div class="tv-channel-stage" style="background:' + grad + ';">' +
      '<div class="tv-channel-stage-top">' +
      '<span class="tv-channel-dial">' + escapeHtml(dialText) + '</span>' +
      '<span class="tv-channel-live">' + escapeHtml(tvT('liveBadge')) + '</span>' +
      '</div>' +
      '<div class="tv-channel-logo-stage">' + logoHtml + '</div>' +
      '</div>' +
      '<div class="tv-card-body">' +
      '<div class="tv-card-title">' + escapeHtml(item.name) + '</div>' +
      '<div class="tv-channel-epg-now">' + escapeHtml(nowTitle) + '</div>' +
      '<div class="tv-channel-epg-bar"><div class="tv-channel-epg-fill" style="width:' + pct + '%;"></div></div>' +
      '</div>';

    btn.onclick = function () {
      lastHubFocusedEl = btn;
      unlockAudio();
      playTdtChannelOnTv(item, 0);
    };
  } else {
    var isTv = item.mediaType === 'tv';
    var metaParts = [];
    if (item.seasonNumber) metaParts.push('T' + item.seasonNumber);
    else metaParts.push(isTv ? tvT('seriesLabel') : tvT('movieLabel'));
    if (item.year && item.year !== 'HD') metaParts.push(item.year);
    if (item.rating) metaParts.push(item.rating + '/10');

    btn.innerHTML =
      '<div class="tv-card-poster-wrap">' +
      '<img class="tv-card-poster" src="' + escapeHtml(item.poster || '/icon.svg') + '" alt="" loading="lazy" onerror="this.style.display=\'none\';if(this.nextSibling)this.nextSibling.style.display=\'flex\';" />' +
      '<div class="tv-card-poster-fallback">' + escapeHtml(item.title) + '</div>' +
      '<div class="tv-card-poster-grad"></div>' +
      '</div>' +
      '<div class="tv-card-body">' +
      '<div class="tv-card-title">' + escapeHtml(item.title) + '</div>' +
      '<div class="tv-card-meta">' + escapeHtml(metaParts.join(' · ')) + '</div>' +
      '</div>';
    btn.onclick = function () {
      lastHubFocusedEl = btn;
      unlockAudio();
      if (isTv) openSeriesModalOnTv(item);
      else playMovieOnTv(item);
    };
  }
  return btn;
}

function appendSection(parent, title, subtitle, items, kind, useGrid, maxOverride) {
  if (!items || !items.length) return;
  var sec = document.createElement('div');
  sec.className = 'tv-section';
  var head = document.createElement('div');
  head.className = 'tv-section-head';
  head.innerHTML =
    '<div class="tv-section-title">' + escapeHtml(title) + '</div>' +
    '<div class="tv-section-sub">' + escapeHtml(subtitle) + '</div>';
  sec.appendChild(head);

  var list = document.createElement('div');
  list.className = useGrid ? 'tv-grid' : 'tv-rail';
  var limit = useGrid
    ? (typeof maxOverride === 'number' && maxOverride > 0 ? Math.min(maxOverride, items.length) : items.length)
    : Math.min(10, items.length);
  var frag = document.createDocumentFragment();
  for (var i = 0; i < limit; i++) {
    frag.appendChild(buildCardButton(items[i], kind));
  }
  list.appendChild(frag);
  sec.appendChild(list);
  parent.appendChild(sec);
}

function updateStageHeaderTitle(tabKey) {
  var map = {
    search: 'tabSearch',
    home: 'tabHome',
    tdt: 'tabTdt',
    football: 'tabFootball',
    releases: 'tabReleases',
    movies: 'tabMovies',
    series: 'tabSeries',
    anime: 'tabAnime',
    kids: 'tabKids',
    games: 'tabGames'
  };
  if (tvStageTitleEl && map[tabKey]) {
    tvStageTitleEl.textContent = tvT(map[tabKey]);
  }
}

function selectHubTabProgrammatic(tabKey, filterKey) {
  var tabBtns = document.querySelectorAll('#hub-nav-tabs .hub-tab-btn');
  for (var k = 0; k < tabBtns.length; k++) {
    var dk = tabBtns[k].getAttribute('data-tab');
    var cls = dk === 'search' ? 'hub-tab-btn rail-item search-left-btn' : 'hub-tab-btn rail-item';
    if (dk === tabKey) cls += ' active';
    tabBtns[k].className = cls;
  }
  activeHubTab = tabKey;
  if (filterKey) {
    activeLiveFilter = filterKey;
    activeLiveVisibleLimit = 24;
  }
  if (hubScrollBody) hubScrollBody.scrollTop = 0;
  renderHubContent();
}

function buildQuickActionDock() {
  var dock = document.createElement('div');
  dock.className = 'tv-quick-dock';
  var resumeCh = typeof getLastWatchedChannelObj === 'function' ? getLastWatchedChannelObj() : null;
  var html = '';
  if (resumeCh) {
    html += '<button type="button" class="tv-quick-btn resume-channel" id="btn-quick-resume" tabindex="0">' + SVG_ICON_PLAY + '<span>' + escapeHtml(tvT('quickResumePre') + resumeCh.name) + '</span></button>';
  }
  html +=
    '<button type="button" class="tv-quick-btn featured" id="btn-quick-football" tabindex="0">' + SVG_ICON_SPORTS + '<span>' + escapeHtml(tvT('quickFootballBtn')) + '</span></button>' +
    '<button type="button" class="tv-quick-btn featured" id="btn-quick-tdt" tabindex="0">' + SVG_ICON_TV + '<span>' + escapeHtml(tvT('quickTdtBtn')) + '</span></button>' +
    '<button type="button" class="tv-quick-btn featured" id="btn-quick-sports" tabindex="0">' + SVG_ICON_SPORTS + '<span>' + escapeHtml(tvT('quickSportsBtn')) + '</span></button>' +
    '<button type="button" class="tv-quick-btn featured" id="btn-quick-kids" tabindex="0">' + SVG_ICON_KIDS + '<span>' + escapeHtml(tvT('quickKidsBtn')) + '</span></button>' +
    '<button type="button" class="tv-quick-btn featured" id="btn-quick-games" tabindex="0">' + SVG_ICON_GAMES + '<span>' + escapeHtml(tvT('quickGamesBtn')) + '</span></button>' +
    '<button type="button" class="tv-quick-btn" id="btn-quick-search" tabindex="0">' + SVG_ICON_SEARCH + '<span>' + escapeHtml(tvT('quickSearchBtn')) + '</span></button>';
  dock.innerHTML = html;

  setTimeout(function () {
    var bRes = document.getElementById('btn-quick-resume');
    var bFb = document.getElementById('btn-quick-football');
    var bTdt = document.getElementById('btn-quick-tdt');
    var bSpr = document.getElementById('btn-quick-sports');
    var bKid = document.getElementById('btn-quick-kids');
    var bGam = document.getElementById('btn-quick-games');
    var bSrc = document.getElementById('btn-quick-search');
    if (bRes && resumeCh) {
      bRes.onclick = function () {
        lastHubFocusedEl = bRes;
        unlockAudio();
        playTdtChannelOnTv(resumeCh, 0);
      };
    }
    if (bFb) bFb.onclick = function () { selectHubTabProgrammatic('football'); };
    if (bTdt) bTdt.onclick = function () { selectHubTabProgrammatic('tdt', 'es_tdt'); };
    if (bSpr) bSpr.onclick = function () { selectHubTabProgrammatic('tdt', 'es_sports'); };
    if (bKid) bKid.onclick = function () { selectHubTabProgrammatic('kids'); };
    if (bGam) bGam.onclick = function () { selectHubTabProgrammatic('games'); };
    if (bSrc) bSrc.onclick = function () { selectHubTabProgrammatic('search'); };
  }, 0);
  return dock;
}

function buildHeroCard(featured, showLiveShortcut) {
  if (!featured) return null;
  var hero = document.createElement('div');
  hero.className = 'tv-hero';
  var bgSrc = featured.backdrop || featured.poster || '';
  var isTv = featured.mediaType === 'tv';
  hero.innerHTML =
    (bgSrc ? '<img class="tv-hero-bg" src="' + escapeHtml(bgSrc) + '" alt="" />' : '') +
    '<div class="tv-hero-grad"></div>' +
    '<div class="tv-hero-content">' +
    '<div class="tv-hero-meta">' + escapeHtml((isTv ? tvT('heroSeriesMeta') : tvT('heroMovieMeta')) + (featured.year ? ' · ' + featured.year : '') + (featured.rating ? ' · ' + featured.rating + '/10' : '')) + '</div>' +
    '<h1 class="tv-hero-title">' + escapeHtml(featured.title) + '</h1>' +
    '<p class="tv-hero-desc">' + escapeHtml(featured.overview || tvT('heroDescFallback')) + '</p>' +
    '<div class="tv-hero-btns">' +
    '<button type="button" class="tv-btn-primary" id="btn-hero-play" tabindex="0">' + escapeHtml(isTv ? tvT('heroWatchSeasons') : tvT('heroPlayNow')) + '</button>' +
    (showLiveShortcut ? '<button type="button" class="tv-btn" id="btn-hero-live" tabindex="0">' + escapeHtml(tvT('heroLiveAction')) + '</button>' : '') +
    '<button type="button" class="tv-btn" id="btn-hero-surprise" tabindex="0">' + escapeHtml(tvT('heroSurprise')) + '</button>' +
    '</div></div>';

  setTimeout(function () {
    var pBtn = document.getElementById('btn-hero-play');
    var lBtn = document.getElementById('btn-hero-live');
    var sBtn = document.getElementById('btn-hero-surprise');
    if (pBtn) {
      pBtn.onclick = function () {
        lastHubFocusedEl = pBtn;
        unlockAudio();
        if (isTv) openSeriesModalOnTv(featured);
        else playMovieOnTv(featured);
      };
    }
    if (lBtn) {
      lBtn.onclick = function () {
        selectHubTabProgrammatic('tdt', 'es_priority');
      };
    }
    if (sBtn) {
      sBtn.onclick = function () {
        lastHubFocusedEl = sBtn;
        unlockAudio();
        var pool = catalogData.movies.concat(catalogData.series, catalogData.anime, catalogData.cinemaReleases);
        if (!pool.length) return;
        var pick = pool[Math.floor(Math.random() * pool.length)];
        if (pick.mediaType === 'tv') openSeriesModalOnTv(pick);
        else playMovieOnTv(pick);
      };
    }
  }, 0);
  return hero;
}

function renderLiveChannelGridInto(containerEl) {
  if (!containerEl) return;
  containerEl.innerHTML = '';
  var filteredList = filterTdtChannels(activeLiveFilter);
  var limitToUse = activeLiveSearch ? Math.min(60, filteredList.length) : Math.min(activeLiveVisibleLimit || 24, filteredList.length);
  var subtitleStr =
    limitToUse < filteredList.length
      ? tvT('showingPrefix') + limitToUse + ' / ' + filteredList.length + tvT('liveGridSubSuffix')
      : filteredList.length + tvT('liveGridSubSuffix');
  appendSection(
    containerEl,
    tvT('liveGridTitle'),
    subtitleStr,
    filteredList,
    'tdt',
    true,
    limitToUse
  );

  if (limitToUse < filteredList.length) {
    var moreWrap = document.createElement('div');
    moreWrap.style.cssText = 'display:flex;justify-content:center;padding:8px 0 28px 0;';
    var moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'tv-btn-primary accent-purple';
    moreBtn.tabIndex = 0;
    moreBtn.textContent = tvT('loadMoreChannels') + ' (' + (filteredList.length - limitToUse) + ')';
    moreBtn.onclick = function () {
      activeLiveVisibleLimit += 24;
      renderLiveChannelGridInto(containerEl);
    };
    moreWrap.appendChild(moreBtn);
    containerEl.appendChild(moreWrap);
  }
}

function renderSearchInstantChannels(stripEl, queryStr) {
  if (!stripEl) return;
  stripEl.innerHTML = '';
  var clean = String(queryStr || '').replace(/^\s+|\s+$/g, '');
  if (!clean) return;
  var matches = filterTdtChannels('all', clean);
  if (!matches.length) return;
  appendSection(stripEl, tvT('searchInstantLiveTitle'), matches.length + ' · ' + tvT('liveBadge'), matches.slice(0, 12), 'tdt', false);
}

function runTvSearch(queryStr) {
  var clean = String(queryStr || '').replace(/^\s+|\s+$/g, '');
  catalogData.searchQuery = clean;
  if (!clean) {
    catalogData.searchResults = [];
    renderHubContent();
    return;
  }
  catalogData.searching = true;
  renderHubContent();

  var done = 0;
  var collected = [];
  var channelMatches = filterTdtChannels('all', clean);
  for (var c = 0; c < Math.min(18, channelMatches.length); c++) {
    collected.push({ _isTdt: true, tdt: channelMatches[c] });
  }
  function finishOne() {
    done++;
    if (done < 2) return;
    catalogData.searching = false;
    catalogData.searchResults = collected;
    renderHubContent(true);
  }
  xhrJson('GET', '/api/catalog/movies?query=' + encodeURIComponent(clean) + '&page=1&lang=' + encodeURIComponent(activeTvLang), null, function (_e, d) {
    if (d && Array.isArray(d.movies)) {
      for (var i = 0; i < Math.min(12, d.movies.length); i++) collected.push(d.movies[i]);
    }
    finishOne();
  });
  xhrJson('GET', '/api/catalog/series?query=' + encodeURIComponent(clean) + '&lang=' + encodeURIComponent(activeTvLang) + '&page=1', null, function (_e, d) {
    if (d && Array.isArray(d.series)) {
      for (var i = 0; i < Math.min(12, d.series.length); i++) collected.push(d.series[i]);
    }
    finishOne();
  });
}

function renderHubContent(focusFirstResult) {
  if (!hubDynamicContent) return;
  updateStageHeaderTitle(activeHubTab);
  hubDynamicContent.innerHTML = '';

  if (activeHubTab === 'search') {
    var panel = document.createElement('div');
    panel.className = 'tv-search-panel';
    panel.innerHTML =
      '<form id="tv-search-form" class="tv-search-row">' +
      '<input type="text" id="tv-search-input" class="tv-search-input" placeholder="' + escapeHtml(tvT('searchPh')) + '" value="' + escapeHtml(catalogData.searchQuery) + '" tabindex="0" />' +
      '<button type="submit" class="tv-btn-primary" tabindex="0">' + escapeHtml(tvT('searchSubmit')) + '</button>' +
      '</form>' +
      '<div class="tv-chips-row">' +
      '<button type="button" class="tv-chip-btn" data-q="DAZN LaLiga" tabindex="0">DAZN LaLiga</button>' +
      '<button type="button" class="tv-chip-btn" data-q="Movistar LaLiga" tabindex="0">Movistar LaLiga</button>' +
      '<button type="button" class="tv-chip-btn" data-q="M+ Liga de Campeones" tabindex="0">M+ Champions</button>' +
      '<button type="button" class="tv-chip-btn" data-q="La 1" tabindex="0">La 1 HD</button>' +
      '<button type="button" class="tv-chip-btn" data-q="Antena 3" tabindex="0">Antena 3</button>' +
      '<button type="button" class="tv-chip-btn" data-q="Telecinco" tabindex="0">Telecinco</button>' +
      '<button type="button" class="tv-chip-btn" data-q="DAZN F1" tabindex="0">DAZN F1</button>' +
      '<button type="button" class="tv-chip-btn" data-q="El Chiringuito" tabindex="0">El Chiringuito</button>' +
      '<button type="button" class="tv-chip-btn" data-q="Solo Leveling" tabindex="0">Solo Leveling</button>' +
      '</div>';
    hubDynamicContent.appendChild(panel);

    var instantLiveStrip = document.createElement('div');
    instantLiveStrip.id = 'tv-search-live-strip';
    hubDynamicContent.appendChild(instantLiveStrip);

    setTimeout(function () {
      var sForm = document.getElementById('tv-search-form');
      var sInput = document.getElementById('tv-search-input');
      if (sForm && sInput) {
        sInput.oninput = function () {
          var val = sInput.value || '';
          catalogData.searchQuery = val;
          if (tvSearchDebounce) clearTimeout(tvSearchDebounce);
          tvSearchDebounce = setTimeout(function () {
            renderSearchInstantChannels(document.getElementById('tv-search-live-strip'), val);
          }, 140);
        };
        sForm.onsubmit = function (ev) {
          if (ev && ev.preventDefault) ev.preventDefault();
          runTvSearch(sInput.value);
          return false;
        };
      }
      var chips = panel.querySelectorAll('.tv-chip-btn');
      for (var c = 0; c < chips.length; c++) {
        (function (chip) {
          chip.onclick = function () {
            runTvSearch(chip.getAttribute('data-q'));
          };
        })(chips[c]);
      }
      if (!focusFirstResult && sInput && activeScreen === 'hub' && document.activeElement === document.body) {
        sInput.focus();
      }
    }, 0);

    if (catalogData.searching) {
      var ld = document.createElement('div');
      ld.style.cssText = 'padding:34px;text-align:center;color:#c8c8d8;font-size:18px;font-weight:700;';
      ld.textContent = tvT('searching');
      hubDynamicContent.appendChild(ld);
      return;
    }

    if (catalogData.searchResults.length > 0) {
      var mixedSec = document.createElement('div');
      mixedSec.className = 'tv-section';
      mixedSec.innerHTML = '<div class="tv-section-head"><div class="tv-section-title">' + escapeHtml(tvT('searchResultsFor')) + ' "' + escapeHtml(catalogData.searchQuery) + '"</div></div>';
      var grid = document.createElement('div');
      grid.className = 'tv-grid';
      for (var r = 0; r < catalogData.searchResults.length; r++) {
        var resItem = catalogData.searchResults[r];
        if (resItem._isTdt) grid.appendChild(buildCardButton(resItem.tdt, 'tdt'));
        else grid.appendChild(buildCardButton(resItem, 'media'));
      }
      mixedSec.appendChild(grid);
      hubDynamicContent.appendChild(mixedSec);
      if (focusFirstResult) {
        setTimeout(function () {
          var firstRes = grid.querySelector('.tv-card');
          if (firstRes && firstRes.focus) firstRes.focus();
        }, 40);
      }
    } else if (catalogData.searchQuery) {
      renderSearchInstantChannels(instantLiveStrip, catalogData.searchQuery);
    }
    return;
  }

  if (activeHubTab === 'home') {
    var featured = catalogData.cinemaReleases[0] || catalogData.movies[0] || catalogData.newSeasons[0];
    var hero = buildHeroCard(featured, true);
    if (hero) hubDynamicContent.appendChild(hero);
    hubDynamicContent.appendChild(buildQuickActionDock());
    if (typeof renderTvFootballHomeStripInto === 'function') {
      renderTvFootballHomeStripInto(hubDynamicContent);
    }

    var spainTdtList = filterTdtChannels('es_tdt');
    var daznMovistarList = filterTdtChannels('es_sports');
    if (spainTdtList.length > 0) {
      appendSection(hubDynamicContent, tvT('secTdtEsTitle'), tvT('secTdtEsSub'), spainTdtList, 'tdt', false);
    }
    if (daznMovistarList.length > 0) {
      appendSection(hubDynamicContent, tvT('secSportsEsTitle'), tvT('secSportsEsSub'), daznMovistarList, 'tdt', false);
    }
    if (!spainTdtList.length && !daznMovistarList.length && catalogData.tdt.length > 0) {
      appendSection(hubDynamicContent, tvT('secLiveTitle'), tvT('secLiveSub'), catalogData.tdt, 'tdt', false);
    }

    appendSection(hubDynamicContent, tvT('secReleasesTitle'), tvT('secReleasesSub'), catalogData.cinemaReleases, 'media', false);
    appendSection(hubDynamicContent, tvT('secSeasonsTitle'), tvT('secSeasonsSub'), catalogData.newSeasons, 'media', false);
    appendSection(hubDynamicContent, tvT('secMoviesTitle'), tvT('secMoviesSub'), catalogData.movies, 'media', false);
    if (catalogData.kidsMovies && catalogData.kidsMovies.length > 0) {
      appendSection(hubDynamicContent, 'Niños en Español · Cine Familiar', 'Películas de animación y dibujos en castellano', catalogData.kidsMovies, 'media', false);
    }
    appendSection(hubDynamicContent, tvT('secAnimeTitle'), tvT('secAnimeSub'), catalogData.anime, 'media', false);
  } else if (activeHubTab === 'tdt') {
    var searchPanel = document.createElement('div');
    searchPanel.className = 'tv-search-panel tv-search-compact';
    searchPanel.innerHTML =
      '<form id="tv-live-search-form" class="tv-search-row" style="margin-bottom:0;">' +
      '<input type="text" id="tv-live-search-input" class="tv-search-input" placeholder="' + escapeHtml(tvT('liveSearchPh')) + '" value="' + escapeHtml(activeLiveSearch) + '" tabindex="0" />' +
      '<button type="submit" class="tv-btn-primary" tabindex="0">' + escapeHtml(tvT('searchSubmit')) + '</button>' +
      (activeLiveSearch ? '<button type="button" id="btn-live-search-clear" class="tv-btn" style="margin-left:10px;" tabindex="0">' + escapeHtml(tvT('liveSearchClear')) + '</button>' : '') +
      '</form>';
    hubDynamicContent.appendChild(searchPanel);

    var filters = [
      { key: 'es_priority', label: tvT('filterEsPriority') },
      { key: 'es_tdt', label: tvT('filterEsTdt') },
      { key: 'es_sports', label: tvT('filterEsSports') },
      { key: 'es_docs_cine', label: tvT('filterEsDocsCine') },
      { key: 'es_regional', label: tvT('filterRegionalEs') },
      { key: 'uk_sports', label: tvT('filterUkSports') },
      { key: 'bein_arabic', label: tvT('filterBeinAr') },
      { key: 'marruecos', label: tvT('filterMarruecos') },
      { key: 'europa_tv', label: tvT('filterEuropa') },
      { key: 'adrar_europa', label: tvT('filterAdrarEuropa') },
      { key: 'all', label: tvT('filterAll') }
    ];
    var filterRow = document.createElement('div');
    filterRow.className = 'tv-filter-row';
    for (var f = 0; f < filters.length; f++) {
      (function (fObj) {
        var fb = document.createElement('button');
        fb.type = 'button';
        fb.className = 'tv-filter-pill' + (activeLiveFilter === fObj.key ? ' active' : '');
        fb.textContent = fObj.label;
        fb.tabIndex = 0;
        fb.setAttribute('data-filter', fObj.key);
        fb.onclick = function () {
          activeLiveFilter = fObj.key;
          activeLiveVisibleLimit = 24;
          if (fObj.key !== 'adrar_europa') activeAdrarCountry = 'all';
          renderHubContent();
          setTimeout(function () {
            var activePill = hubDynamicContent.querySelector('.tv-filter-pill[data-filter="' + fObj.key + '"]');
            if (activePill && activePill.focus) activePill.focus();
          }, 20);
        };
        filterRow.appendChild(fb);
      })(filters[f]);
    }
    hubDynamicContent.appendChild(filterRow);

    if (activeLiveFilter === 'adrar_europa') {
      var countries = [
        { code: 'all', label: tvT('filterAll') },
        { code: 'es', label: 'ES' },
        { code: 'fr', label: 'FR' },
        { code: 'de', label: 'DE' },
        { code: 'it', label: 'IT' },
        { code: 'tr', label: 'TR' },
        { code: 'uk', label: 'UK' },
        { code: 'pt', label: 'PT' }
      ];
      var subRow = document.createElement('div');
      subRow.className = 'tv-filter-row';
      for (var ac = 0; ac < countries.length; ac++) {
        (function (cObj) {
          var cb = document.createElement('button');
          cb.type = 'button';
          cb.className = 'tv-filter-pill' + (activeAdrarCountry === cObj.code ? ' active' : '');
          cb.textContent = cObj.label;
          cb.tabIndex = 0;
          cb.setAttribute('data-country', cObj.code);
          cb.onclick = function () {
            activeAdrarCountry = cObj.code;
            activeLiveVisibleLimit = 24;
            renderHubContent();
            setTimeout(function () {
              var activeC = hubDynamicContent.querySelector('.tv-filter-pill[data-country="' + cObj.code + '"]');
              if (activeC && activeC.focus) activeC.focus();
            }, 20);
          };
          subRow.appendChild(cb);
        })(countries[ac]);
      }
      hubDynamicContent.appendChild(subRow);
    }

    var resultsWrap = document.createElement('div');
    resultsWrap.id = 'tv-live-results-wrap';
    hubDynamicContent.appendChild(resultsWrap);
    renderLiveChannelGridInto(resultsWrap);

    setTimeout(function () {
      var lForm = document.getElementById('tv-live-search-form');
      var lInput = document.getElementById('tv-live-search-input');
      var lClear = document.getElementById('btn-live-search-clear');
      if (lForm && lInput) {
        lInput.oninput = function () {
          activeLiveSearch = lInput.value || '';
          activeLiveVisibleLimit = 24;
          if (tvLiveFilterDebounce) clearTimeout(tvLiveFilterDebounce);
          tvLiveFilterDebounce = setTimeout(function () {
            renderLiveChannelGridInto(document.getElementById('tv-live-results-wrap'));
          }, 180);
        };
        lForm.onsubmit = function (ev) {
          if (ev && ev.preventDefault) ev.preventDefault();
          activeLiveSearch = lInput.value || '';
          activeLiveVisibleLimit = 24;
          renderLiveChannelGridInto(document.getElementById('tv-live-results-wrap'));
          return false;
        };
      }
      if (lClear) {
        lClear.onclick = function () {
          activeLiveSearch = '';
          activeLiveVisibleLimit = 24;
          renderHubContent();
        };
      }
    }, 0);
  } else if (activeHubTab === 'football') {
    if (typeof renderTvFootballHubInto === 'function') {
      renderTvFootballHubInto(hubDynamicContent);
    }
  } else if (activeHubTab === 'releases') {
    var rHero = buildHeroCard(catalogData.cinemaReleases[0] || catalogData.newSeasons[0], false);
    if (rHero) hubDynamicContent.appendChild(rHero);
    appendSection(hubDynamicContent, tvT('secReleasesTitle'), tvT('releasesAllSub'), catalogData.cinemaReleases, 'media', true);
    appendSection(hubDynamicContent, tvT('seasonsAllTitle'), tvT('seasonsAllSub'), catalogData.newSeasons, 'media', true);
  } else if (activeHubTab === 'movies') {
    var mHero = buildHeroCard(catalogData.movies[0] || catalogData.cinemaReleases[0], false);
    if (mHero) hubDynamicContent.appendChild(mHero);
    appendSection(hubDynamicContent, tvT('moviesCatalogTitle'), tvT('moviesCatalogSub'), catalogData.movies, 'media', true);
  } else if (activeHubTab === 'series') {
    var sHero = buildHeroCard(catalogData.series[0] || catalogData.newSeasons[0], false);
    if (sHero) hubDynamicContent.appendChild(sHero);
    appendSection(hubDynamicContent, tvT('seriesCatalogTitle'), tvT('seriesCatalogSub'), catalogData.series, 'media', true);
  } else if (activeHubTab === 'anime') {
    var aHero = buildHeroCard(catalogData.anime[0], false);
    if (aHero) hubDynamicContent.appendChild(aHero);
    appendSection(hubDynamicContent, tvT('secAnimeTitle'), tvT('animeCatalogSub'), catalogData.anime, 'media', true);
  } else if (activeHubTab === 'kids') {
    renderSpanishKidsHubInto(hubDynamicContent);
  } else if (activeHubTab === 'games') {
    if (typeof window.renderTvGamesCatalogInto === 'function') {
      window.renderTvGamesCatalogInto(hubDynamicContent);
    }
  }
}

function renderSpanishKidsHubInto(container) {
  var kidsCh = [];
  var allLive = catalogData.tdt || [];
  for (var i = 0; i < allLive.length; i++) {
    if (isSpanishKidsChannel(allLive[i])) kidsCh.push(allLive[i]);
  }

  var banner = document.createElement('div');
  banner.className = 'tv-kids-hero-banner';
  banner.innerHTML =
    '<div class="tv-kids-hero-copy">' +
    '<div class="tv-kids-pill">SECCIÓN INFANTIL · 100% EN ESPAÑOL</div>' +
    '<div class="tv-kids-title">Dibujos, Cine Familiar y Canales para Niños</div>' +
    '<div class="tv-kids-sub">Clan RTVE, Boing, las mejores películas Pixar/Disney y series infantiles siempre con títulos y audio en español.</div>' +
    '</div>' +
    '<div class="tv-kids-actions">' +
    (kidsCh[0] ? '<button type="button" class="tv-btn-primary" id="btn-kids-live-first" tabindex="0">Ver ' + escapeHtml(kidsCh[0].name) + '</button>' : '') +
    '<button type="button" class="tv-btn" id="btn-kids-open-games" tabindex="0">Juegos con Mando</button>' +
    '</div>';
  container.appendChild(banner);

  setTimeout(function () {
    var bLive = document.getElementById('btn-kids-live-first');
    var bGam = document.getElementById('btn-kids-open-games');
    if (bLive && kidsCh[0]) {
      bLive.onclick = function () {
        lastHubFocusedEl = bLive;
        unlockAudio();
        playTdtChannelOnTv(kidsCh[0], 0);
      };
    }
    if (bGam) {
      bGam.onclick = function () {
        selectHubTabProgrammatic('games');
      };
    }
  }, 0);

  if (kidsCh.length > 0) {
    appendSection(container, 'Canales Infantiles en Directo (Español)', 'Clan RTVE y Boing 24h en castellano', kidsCh, 'tdt', false);
  }
  if (catalogData.kidsSeries && catalogData.kidsSeries.length > 0) {
    appendSection(container, 'Series de Dibujos en Español', 'Bluey, Patrulla Canina, Peppa Pig, Bob Esponja, Doraemon y más', catalogData.kidsSeries, 'media', true);
  }
  if (catalogData.kidsMovies && catalogData.kidsMovies.length > 0) {
    appendSection(container, 'Películas Infantiles y Familiares en Español', 'Todo el cine infantil y animación en castellano', catalogData.kidsMovies, 'media', true);
  }
}

function renderProgressiveIfSafe(immediate) {
  if (!catalogData.loaded) return;
  if (activeScreen !== 'hub') return;
  var runRender = function () {
    tvProgressiveRenderTimer = null;
    if (!catalogData.loaded || activeScreen !== 'hub') return;
    var activeEl = document.activeElement;
    if (activeEl && activeEl.tagName === 'INPUT') return;
    if (activeEl && hubDynamicContent && hubDynamicContent.contains(activeEl)) {
      return;
    }
    renderHubContent();
  };
  if (immediate) {
    if (tvProgressiveRenderTimer) {
      clearTimeout(tvProgressiveRenderTimer);
      tvProgressiveRenderTimer = null;
    }
    runRender();
    return;
  }
  if (tvProgressiveRenderTimer) clearTimeout(tvProgressiveRenderTimer);
  tvProgressiveRenderTimer = setTimeout(runRender, 160);
}

function updateTdtEpgCardsInPlace() {
  if (!hubDynamicContent || !catalogData.epg) return;
  var cards = hubDynamicContent.querySelectorAll('.tv-card[data-tdt-id]');
  for (var i = 0; i < cards.length; i++) {
    var card = cards[i];
    var id = card.getAttribute('data-tdt-id');
    var chEpg = id ? catalogData.epg[id] : null;
    if (!chEpg) continue;
    var nowEl = card.querySelector('.tv-channel-epg-now');
    if (nowEl && chEpg.now && chEpg.now.title) {
      nowEl.textContent = chEpg.now.title;
    }
    var fillEl = card.querySelector('.tv-channel-epg-fill');
    if (fillEl && typeof chEpg.progressPct === 'number') {
      fillEl.style.width = Math.max(6, Math.min(100, chEpg.progressPct)) + '%';
    }
  }
}

function prewarmFlagshipChannels() {
  if (typeof isSmartTvUa !== 'undefined' && isSmartTvUa) return;
  if (typeof prewarmTdtChannelOnTv !== 'function' || !catalogData.tdt || !catalogData.tdt.length) return;
  var targets = ['tdt-la1', 'tdt-antena3', 'dazn-laliga'];
  for (var t = 0; t < targets.length; t++) {
    for (var i = 0; i < catalogData.tdt.length; i++) {
      if (catalogData.tdt[i] && catalogData.tdt[i].id === targets[t]) {
        (function (chItem, delayMs) {
          setTimeout(function () {
            if (activeScreen === 'hub') prewarmTdtChannelOnTv(chItem, 0);
          }, delayMs);
        })(catalogData.tdt[i], 300 + t * 250);
        break;
      }
    }
  }
}

function loadLiveEpg() {
  xhrJson('GET', '/api/epg/live', null, function (_e, d) {
    if (d && d.epg) {
      catalogData.epg = d.epg;
      if (catalogData.loaded && (activeHubTab === 'tdt' || activeHubTab === 'home')) {
        updateTdtEpgCardsInPlace();
      }
    }
  });
}

// Instant cold-boot snapshot hydration (0ms render on repeat visits)
try {
  var snapRaw = localStorage.getItem(TV_TDT_SNAP_KEY);
  if (snapRaw) {
    var snap = JSON.parse(snapRaw);
    if (snap && Array.isArray(snap.channels) && snap.channels.length > 0) {
      catalogData.tdtBase = snap.channels;
      mergeTvLiveCatalog();
      catalogData.loaded = true;
    }
  }
} catch (e) {}

function getBuiltInAntena3Channel() {
  return {
    id: 'tdt-antena3',
    dial: 3,
    name: 'Antena 3',
    network: 'Atresmedia',
    category: 'generalistas',
    quality: '1080p HD',
    description: 'El Hormiguero, Pasapalabra, Antena 3 Noticias y series estelares',
    channels: [
      {
        id: 'a3-belix-intl',
        label: 'Señal Principal FHD · Edge 2 (Antena 3)',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: '/api/belix/stream/531071.m3u8',
        resolverType: 'direct_hls'
      },
      {
        id: 'a3-dvb-hd',
        label: 'Señal Directa España 1080p HD (Antena 3)',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/20/index.m3u8',
        resolverType: 'tdt_hls'
      },
      {
        id: 'a3-belix-hd',
        label: 'Señal Respaldo Belix HD AAC (Antena 3)',
        lang: 'ES',
        quality: '720p',
        sourceUrl: '/api/belix/stream/743056.m3u8',
        resolverType: 'direct_hls'
      },
      {
        id: 'a3-uhd',
        label: 'Señal Respaldo Belix FHD AAC (Antena 3)',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: '/api/belix/stream/743023.m3u8',
        resolverType: 'direct_hls'
      }
    ]
  };
}


var tvCatalogRetryCount = 0;
function loadTvCatalog() {
  var pending = 8;
  var anySuccess = false;
  function onPartialReady() {
    var hasAny =
      catalogData.tdt.length > 0 ||
      catalogData.cinemaReleases.length > 0 ||
      catalogData.movies.length > 0 ||
      catalogData.series.length > 0 ||
      catalogData.kidsMovies.length > 0;
    if (hasAny && !catalogData.loaded) {
      catalogData.loaded = true;
      renderHubContent();
    } else if (hasAny) {
      renderProgressiveIfSafe();
    }
  }
  function checkDone() {
    pending--;
    onPartialReady();
    if (pending <= 0) {
      mergeTvLiveCatalog();
      var hasAnyItems =
        catalogData.cinemaReleases.length > 0 ||
        catalogData.movies.length > 0 ||
        catalogData.series.length > 0 ||
        catalogData.tdt.length > 0;
      if (anySuccess || hasAnyItems) {
        catalogData.loaded = true;
        renderProgressiveIfSafe(true);
      } else if (tvCatalogRetryCount < 3) {
        tvCatalogRetryCount += 1;
        setTimeout(loadTvCatalog, 2500);
      } else {
        catalogData.loaded = true;
        renderHubContent();
      }
    }
  }

  xhrJson('GET', '/api/catalog/tdt', null, function (err, d) {
    if (!err && d && Array.isArray(d.channels)) {
      anySuccess = true;
      catalogData.tdtBase = d.channels;
      try {
        localStorage.setItem(TV_TDT_SNAP_KEY, JSON.stringify({ ts: Date.now(), channels: d.channels.slice(0, 60) }));
      } catch (e) {}
    }
    mergeTvLiveCatalog();
    checkDone();
    prewarmFlagshipChannels();
  });
  xhrJson('GET', '/api/catalog/latest-releases?lang=' + encodeURIComponent(activeTvLang), null, function (err, d) {
    if (!err && d) {
      anySuccess = true;
      if (Array.isArray(d.cinemaReleases)) catalogData.cinemaReleases = d.cinemaReleases;
      if (Array.isArray(d.newSeasons)) catalogData.newSeasons = d.newSeasons;
    }
    checkDone();
  });
  setTimeout(function () {
    xhrJson('GET', '/api/catalog/movies?category=trending&page=1&lang=' + encodeURIComponent(activeTvLang), null, function (err, d) {
      if (!err && d && Array.isArray(d.movies)) {
        anySuccess = true;
        catalogData.movies = d.movies;
      }
      checkDone();
    });
    xhrJson('GET', '/api/catalog/series?category=trending&page=1&lang=' + encodeURIComponent(activeTvLang), null, function (err, d) {
      if (!err && d && Array.isArray(d.series)) {
        anySuccess = true;
        catalogData.series = d.series;
      }
      checkDone();
    });
    xhrJson('GET', '/api/catalog/series?provider=crunchyroll&category=trending&page=1&lang=' + encodeURIComponent(activeTvLang), null, function (err, d) {
      if (!err && d && Array.isArray(d.series)) {
        anySuccess = true;
        catalogData.anime = d.series;
      }
      checkDone();
    });
    xhrJson('GET', '/api/catalog/movies?category=kids&page=1&lang=es', null, function (err, d) {
      if (!err && d && Array.isArray(d.movies)) {
        anySuccess = true;
        for (var km = 0; km < d.movies.length; km++) {
          if (d.movies[km]) d.movies[km]._forceEs = true;
        }
        catalogData.kidsMovies = d.movies;
      }
      checkDone();
    });
    xhrJson('GET', '/api/catalog/series?category=kids&page=1&lang=es', null, function (err, d) {
      if (!err && d && Array.isArray(d.series)) {
        anySuccess = true;
        for (var ks = 0; ks < d.series.length; ks++) {
          if (d.series[ks]) d.series[ks]._forceEs = true;
        }
        catalogData.kidsSeries = d.series;
      }
      checkDone();
    });
  }, 300);

  setTimeout(function () {
    xhrJson('GET', '/api/catalog/world-tv', null, function (err, d) {
      if (!err && d && Array.isArray(d.channels)) {
        anySuccess = true;
        catalogData.worldTv = d.channels;
      }
      mergeTvLiveCatalog();
      checkDone();
    });
  }, 700);
  loadLiveEpg();
  if (typeof loadTvFootballBoard === 'function') {
    setTimeout(function () {
      loadTvFootballBoard(true);
    }, 250);
  }
}
setInterval(loadLiveEpg, 3 * 60 * 1000);
if (window.addEventListener) {
  window.addEventListener('online', function () {
    if (typeof runTvVersionCheck === 'function') runTvVersionCheck(false);
    if (!catalogData.loaded || (catalogData.movies.length === 0 && catalogData.tdt.length === 0)) {
      tvCatalogRetryCount = 0;
      loadTvCatalog();
    }
    if (typeof requestPairingCode === 'function' && !isPaired) {
      requestPairingCode(false);
    }
  });
}
