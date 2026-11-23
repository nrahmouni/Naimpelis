// ===================================================================
// NETWORK BROADCAST VISUALS, LIVE FILTERING & HUB CATALOG RENDERING
// ===================================================================
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
  if (id === 'tdt-la1' || id === 'tdt-24h') return 'linear-gradient(145deg, #0055b8 0%, #091834 100%)';
  if (id === 'tdt-la2') return 'linear-gradient(145deg, #027c8c 0%, #091f28 100%)';
  if (id === 'tdt-antena3' || id === 'tdt-neox' || id === 'tdt-mega') return 'linear-gradient(145deg, #d94e0f 0%, #2a120a 100%)';
  if (id === 'tdt-cuatro') return 'linear-gradient(145deg, #c81938 0%, #240912 100%)';
  if (id === 'tdt-telecinco' || id === 'tdt-fdf') return 'linear-gradient(145deg, #0284c7 0%, #0a192e 100%)';
  if (id === 'tdt-lasexta') return 'linear-gradient(145deg, #059669 0%, #092119 100%)';
  if (cat === 'movistar') return 'linear-gradient(145deg, #0369a1 0%, #0c1424 100%)';
  if (cat === 'dazn') return 'linear-gradient(145deg, #334155 0%, #0c0d10 100%)';
  if (cat === 'bein_arabic') return 'linear-gradient(145deg, #5b21b6 0%, #140b24 100%)';
  if (cat === 'marruecos') return 'linear-gradient(145deg, #b91c1c 0%, #142b1d 100%)';
  if (cat === 'documentales') return 'linear-gradient(145deg, #ca8a04 0%, #1c1406 100%)';
  if (cat === 'usa_tv') return 'linear-gradient(145deg, #1d4ed8 0%, #180d22 100%)';
  if (cat === 'europa_tv') return 'linear-gradient(145deg, #0f766e 0%, #0c1726 100%)';
  if (cat === 'noticias_intl') return 'linear-gradient(145deg, #d97706 0%, #1c130a 100%)';
  if (cat === 'uk_sports') return 'linear-gradient(145deg, #1d4ed8 0%, #3b0a24 100%)';
  if (cat === 'china_football') return 'linear-gradient(145deg, #be123c 0%, #1f0a12 100%)';
  if (cat === 'espn' || cat === 'dsports' || cat === 'beinsports') return 'linear-gradient(145deg, #991b1b 0%, #160a0d 100%)';
  if (cat === 'cine_series' || cat === 'tnt_space') return 'linear-gradient(145deg, #6d28d9 0%, #160e26 100%)';
  if (cat === 'infantil_autonomicas') return 'linear-gradient(145deg, #0f766e 0%, #0e1d20 100%)';
  return 'linear-gradient(145deg, #3b2472 0%, #121218 100%)';
}

function mergeTvLiveCatalog() {
  var base = Array.isArray(catalogData.tdtBase) ? catalogData.tdtBase : [];
  var world = Array.isArray(catalogData.worldTv) ? catalogData.worldTv : [];
  var merged = [];
  var seen = {};
  var i;
  for (i = 0; i < base.length; i++) {
    if (base[i] && base[i].id && !seen[base[i].id]) {
      seen[base[i].id] = true;
      merged.push(base[i]);
    }
  }
  for (i = 0; i < world.length; i++) {
    if (world[i] && world[i].id && !seen[world[i].id]) {
      seen[world[i].id] = true;
      merged.push(world[i]);
    }
  }
  catalogData.tdt = merged;
}

function channelMatchesCategoryFilter(c, filterKey) {
  if (!filterKey || filterKey === 'all') return true;
  var cat = c.category || '';
  if (filterKey === 'es_tdt') return cat === 'generalistas' || cat === 'noticias_deportes' || cat === 'entretenimiento';
  if (filterKey === 'es_sports') return cat === 'movistar' || cat === 'dazn';
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
  if (filterKey === 'kids_world') return cat === 'kids_world';
  if (filterKey === 'kids_reg') return cat === 'infantil_autonomicas';
  return cat === filterKey;
}

function filterTdtChannels(filterKey) {
  var all = catalogData.tdt || [];
  var q = String(activeLiveSearch || '').replace(/^\s+|\s+$/g, '').toLowerCase();
  var out = [];
  for (var i = 0; i < all.length; i++) {
    var c = all[i];
    if (!channelMatchesCategoryFilter(c, filterKey)) continue;
    if (q) {
      var chEpg = catalogData.epg ? catalogData.epg[c.id] : null;
      var epgTitle = chEpg && chEpg.now && chEpg.now.title ? chEpg.now.title.toLowerCase() : '';
      var hay =
        (c.name ? c.name.toLowerCase() : '') + ' ' +
        (c.network ? c.network.toLowerCase() : '') + ' ' +
        (c.dial ? String(c.dial) : '') + ' ' +
        (c.countryCode ? String(c.countryCode).toLowerCase() : '') + ' ' +
        epgTitle;
      if (hay.indexOf(q) === -1) continue;
    }
    out.push(c);
  }
  return out;
}

function buildCardButton(item, kind) {
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = kind === 'tdt' ? 'tv-card channel-card' : 'tv-card';
  btn.tabIndex = 0;

  if (kind === 'tdt') {
    var dialText = item.dial ? tvT('dialPrefix') + item.dial : tvT('liveNow');
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
      '<span class="tv-channel-live"><span class="tv-live-dot"></span>' + escapeHtml(tvT('liveBadge')) + '</span>' +
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
    if (item.rating) metaParts.push('★ ' + item.rating);

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
    : Math.min(18, items.length);
  for (var i = 0; i < limit; i++) {
    list.appendChild(buildCardButton(items[i], kind));
  }
  sec.appendChild(list);
  parent.appendChild(sec);
}

function buildHeroCard(featured) {
  if (!featured) return null;
  var hero = document.createElement('div');
  hero.className = 'tv-hero';
  var bgSrc = featured.backdrop || featured.poster || '';
  var isTv = featured.mediaType === 'tv';
  hero.innerHTML =
    (bgSrc ? '<img class="tv-hero-bg" src="' + escapeHtml(bgSrc) + '" alt="" />' : '') +
    '<div class="tv-hero-grad"></div>' +
    '<div class="tv-hero-content">' +
    '<div class="tv-hero-meta">' + escapeHtml((isTv ? tvT('heroSeriesMeta') : tvT('heroMovieMeta')) + (featured.year ? ' · ' + featured.year : '') + (featured.rating ? ' · ★ ' + featured.rating : '')) + '</div>' +
    '<h1 class="tv-hero-title">' + escapeHtml(featured.title) + '</h1>' +
    '<p class="tv-hero-desc">' + escapeHtml(featured.overview || tvT('heroDescFallback')) + '</p>' +
    '<div class="tv-hero-btns">' +
    '<button type="button" class="tv-btn-primary" id="btn-hero-play" tabindex="0">' + escapeHtml(isTv ? tvT('heroWatchSeasons') : tvT('heroPlayNow')) + '</button>' +
    '<button type="button" class="tv-btn" id="btn-hero-surprise" tabindex="0">' + escapeHtml(tvT('heroSurprise')) + '</button>' +
    '</div></div>';

  setTimeout(function () {
    var pBtn = document.getElementById('btn-hero-play');
    var sBtn = document.getElementById('btn-hero-surprise');
    if (pBtn) {
      pBtn.onclick = function () {
        lastHubFocusedEl = pBtn;
        unlockAudio();
        if (isTv) openSeriesModalOnTv(featured);
        else playMovieOnTv(featured);
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
  function finishOne() {
    done++;
    if (done < 3) return;
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
  setTimeout(function () {
    var low = clean.toLowerCase();
    for (var i = 0; i < catalogData.tdt.length; i++) {
      var ch = catalogData.tdt[i];
      if (
        (ch.name && ch.name.toLowerCase().indexOf(low) !== -1) ||
        (ch.network && ch.network.toLowerCase().indexOf(low) !== -1) ||
        (ch.category && ch.category.toLowerCase().indexOf(low) !== -1)
      ) {
        collected.push({ _isTdt: true, tdt: ch });
      }
    }
    finishOne();
  }, 0);
}

function renderHubContent(focusFirstResult) {
  if (!hubDynamicContent) return;
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
      '<button type="button" class="tv-chip-btn" data-q="beIN SPORTS 1" tabindex="0">beIN SPORTS 1</button>' +
      '<button type="button" class="tv-chip-btn" data-q="National Geographic" tabindex="0">National Geographic</button>' +
      '<button type="button" class="tv-chip-btn" data-q="Al Jazeera" tabindex="0">Al Jazeera</button>' +
      '<button type="button" class="tv-chip-btn" data-q="LiveNOW from FOX" tabindex="0">FOX USA</button>' +
      '<button type="button" class="tv-chip-btn" data-q="Sky Sports" tabindex="0">Sky Sports UK</button>' +
      '<button type="button" class="tv-chip-btn" data-q="La 1" tabindex="0">La 1 HD</button>' +
      '<button type="button" class="tv-chip-btn" data-q="Solo Leveling" tabindex="0">Solo Leveling</button>' +
      '</div>';
    hubDynamicContent.appendChild(panel);

    setTimeout(function () {
      var sForm = document.getElementById('tv-search-form');
      var sInput = document.getElementById('tv-search-input');
      if (sForm && sInput) {
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
      ld.style.cssText = 'padding:30px;text-align:center;color:#adadb8;font-size:16px;';
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
    }
    return;
  }

  if (activeHubTab === 'home') {
    var featured = catalogData.cinemaReleases[0] || catalogData.movies[0] || catalogData.newSeasons[0];
    var hero = buildHeroCard(featured);
    if (hero) hubDynamicContent.appendChild(hero);
    appendSection(hubDynamicContent, tvT('secLiveTitle'), tvT('secLiveSub'), catalogData.tdt, 'tdt', false);
    appendSection(hubDynamicContent, tvT('secReleasesTitle'), tvT('secReleasesSub'), catalogData.cinemaReleases, 'media', false);
    appendSection(hubDynamicContent, tvT('secSeasonsTitle'), tvT('secSeasonsSub'), catalogData.newSeasons, 'media', false);
    appendSection(hubDynamicContent, tvT('secMoviesTitle'), tvT('secMoviesSub'), catalogData.movies, 'media', false);
    appendSection(hubDynamicContent, tvT('secAnimeTitle'), tvT('secAnimeSub'), catalogData.anime, 'media', false);
  } else if (activeHubTab === 'tdt') {
    var searchPanel = document.createElement('div');
    searchPanel.className = 'tv-search-panel';
    searchPanel.innerHTML =
      '<form id="tv-live-search-form" class="tv-search-row" style="margin-bottom:0;">' +
      '<input type="text" id="tv-live-search-input" class="tv-search-input" placeholder="' + escapeHtml(tvT('liveSearchPh')) + '" value="' + escapeHtml(activeLiveSearch) + '" tabindex="0" />' +
      '<button type="submit" class="tv-btn-primary" style="margin-right:8px;" tabindex="0">' + escapeHtml(tvT('searchSubmit')) + '</button>' +
      (activeLiveSearch ? '<button type="button" id="btn-live-search-clear" class="tv-btn" tabindex="0">' + escapeHtml(tvT('liveSearchClear')) + '</button>' : '') +
      '</form>';
    hubDynamicContent.appendChild(searchPanel);

    setTimeout(function () {
      var lForm = document.getElementById('tv-live-search-form');
      var lInput = document.getElementById('tv-live-search-input');
      var lClear = document.getElementById('btn-live-search-clear');
      if (lForm && lInput) {
        lForm.onsubmit = function (ev) {
          if (ev && ev.preventDefault) ev.preventDefault();
          activeLiveSearch = lInput.value || '';
          activeLiveVisibleLimit = 60;
          renderHubContent();
          setTimeout(function () {
            var ni = document.getElementById('tv-live-search-input');
            if (ni && ni.focus) ni.focus();
          }, 20);
          return false;
        };
      }
      if (lClear) {
        lClear.onclick = function () {
          activeLiveSearch = '';
          activeLiveVisibleLimit = 60;
          renderHubContent();
        };
      }
    }, 0);

    var filters = [
      { key: 'all', label: tvT('filterAll') + ' (' + catalogData.tdt.length + ')' },
      { key: 'es_tdt', label: tvT('filterEsTdt') },
      { key: 'es_sports', label: tvT('filterEsSports') },
      { key: 'world_cricket', label: tvT('filterWorldCricket') },
      { key: 'bein_arabic', label: tvT('filterBeinAr') },
      { key: 'marruecos', label: tvT('filterMarruecos') },
      { key: 'elahmad_mena', label: tvT('filterElahmadMena') },
      { key: 'adrar_europa', label: tvT('filterAdrarEuropa') },
      { key: 'documentales', label: tvT('filterDocs') },
      { key: 'usa_tv', label: tvT('filterUsa') },
      { key: 'europa_tv', label: tvT('filterEuropa') },
      { key: 'noticias_intl', label: tvT('filterNoticias') },
      { key: 'uk_sports', label: tvT('filterUkSports') },
      { key: 'china_football', label: tvT('filterChina') },
      { key: 'intl_sports', label: tvT('filterIntlSports') },
      { key: 'cine', label: tvT('filterCine') },
      { key: 'famelack_movies', label: tvT('filterFamelackMovies') },
      { key: 'kids_world', label: tvT('filterKidsWorld') },
      { key: 'kids_reg', label: tvT('filterKidsReg') }
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
          activeLiveVisibleLimit = 60;
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
        { code: 'es', label: '🇪🇸 ES' },
        { code: 'fr', label: '🇫🇷 FR' },
        { code: 'de', label: '🇩🇪 DE' },
        { code: 'it', label: '🇮🇹 IT' },
        { code: 'tr', label: '🇹🇷 TR' },
        { code: 'uk', label: '🇬🇧 UK' },
        { code: 'pt', label: '🇵🇹 PT' },
        { code: 'nl', label: '🇳🇱 NL' },
        { code: 'be', label: '🇧🇪 BE' },
        { code: 'ru', label: '🇷🇺 RU' }
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
            activeLiveVisibleLimit = 60;
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

    var filteredList = filterTdtChannels(activeLiveFilter);
    var limitToUse = activeLiveSearch ? filteredList.length : Math.min(activeLiveVisibleLimit, filteredList.length);
    var subtitleStr =
      limitToUse < filteredList.length
        ? tvT('showingPrefix') + limitToUse + ' / ' + filteredList.length + tvT('liveGridSubSuffix')
        : filteredList.length + tvT('liveGridSubSuffix');
    appendSection(
      hubDynamicContent,
      tvT('liveGridTitle'),
      subtitleStr,
      filteredList,
      'tdt',
      true,
      limitToUse
    );

    if (limitToUse < filteredList.length) {
      var moreWrap = document.createElement('div');
      moreWrap.style.cssText = 'display:flex;justify-content:center;padding:8px 0 24px 0;';
      var moreBtn = document.createElement('button');
      moreBtn.type = 'button';
      moreBtn.className = 'tv-btn-primary';
      moreBtn.tabIndex = 0;
      moreBtn.textContent = tvT('loadMoreChannels') + ' (' + (filteredList.length - limitToUse) + ')';
      moreBtn.onclick = function () {
        activeLiveVisibleLimit += 60;
        renderHubContent();
      };
      moreWrap.appendChild(moreBtn);
      hubDynamicContent.appendChild(moreWrap);
    }
  } else if (activeHubTab === 'releases') {
    var rHero = buildHeroCard(catalogData.cinemaReleases[0] || catalogData.newSeasons[0]);
    if (rHero) hubDynamicContent.appendChild(rHero);
    appendSection(hubDynamicContent, tvT('secReleasesTitle'), tvT('releasesAllSub'), catalogData.cinemaReleases, 'media', true);
    appendSection(hubDynamicContent, tvT('seasonsAllTitle'), tvT('seasonsAllSub'), catalogData.newSeasons, 'media', true);
  } else if (activeHubTab === 'movies') {
    var mHero = buildHeroCard(catalogData.movies[0] || catalogData.cinemaReleases[0]);
    if (mHero) hubDynamicContent.appendChild(mHero);
    appendSection(hubDynamicContent, tvT('moviesCatalogTitle'), tvT('moviesCatalogSub'), catalogData.movies, 'media', true);
  } else if (activeHubTab === 'series') {
    var sHero = buildHeroCard(catalogData.series[0] || catalogData.newSeasons[0]);
    if (sHero) hubDynamicContent.appendChild(sHero);
    appendSection(hubDynamicContent, tvT('seriesCatalogTitle'), tvT('seriesCatalogSub'), catalogData.series, 'media', true);
  } else if (activeHubTab === 'anime') {
    var aHero = buildHeroCard(catalogData.anime[0]);
    if (aHero) hubDynamicContent.appendChild(aHero);
    appendSection(hubDynamicContent, tvT('secAnimeTitle'), tvT('animeCatalogSub'), catalogData.anime, 'media', true);
  }
}

function loadLiveEpg() {
  xhrJson('GET', '/api/epg/live', null, function (_e, d) {
    if (d && d.epg) {
      catalogData.epg = d.epg;
      if (catalogData.loaded && (activeHubTab === 'tdt' || activeHubTab === 'home')) {
        if (activeScreen === 'hub' && document.activeElement && !hubDynamicContent.contains(document.activeElement)) {
          renderHubContent();
        }
      }
    }
  });
}

var tvCatalogRetryCount = 0;
function loadTvCatalog() {
  var pending = 6;
  var anySuccess = false;
  function checkDone() {
    pending--;
    if (pending <= 0) {
      mergeTvLiveCatalog();
      var hasAnyItems =
        catalogData.cinemaReleases.length > 0 ||
        catalogData.movies.length > 0 ||
        catalogData.series.length > 0 ||
        catalogData.tdt.length > 0;
      if (anySuccess || hasAnyItems) {
        catalogData.loaded = true;
        renderHubContent();
      } else if (tvCatalogRetryCount < 3) {
        tvCatalogRetryCount += 1;
        setTimeout(loadTvCatalog, 3000);
      } else {
        catalogData.loaded = true;
        renderHubContent();
      }
    }
  }
  xhrJson('GET', '/api/catalog/latest-releases?lang=' + encodeURIComponent(activeTvLang), null, function (err, d) {
    if (!err && d) {
      anySuccess = true;
      if (Array.isArray(d.cinemaReleases)) catalogData.cinemaReleases = d.cinemaReleases;
      if (Array.isArray(d.newSeasons)) catalogData.newSeasons = d.newSeasons;
    }
    checkDone();
  });
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
  xhrJson('GET', '/api/catalog/tdt', null, function (err, d) {
    if (!err && d && Array.isArray(d.channels)) {
      anySuccess = true;
      catalogData.tdtBase = d.channels;
    }
    mergeTvLiveCatalog();
    checkDone();
  });
  xhrJson('GET', '/api/catalog/world-tv', null, function (err, d) {
    if (!err && d && Array.isArray(d.channels)) {
      anySuccess = true;
      catalogData.worldTv = d.channels;
    }
    mergeTvLiveCatalog();
    checkDone();
  });
  loadLiveEpg();
}
setInterval(loadLiveEpg, 3 * 60 * 1000);
if (window.addEventListener) {
  window.addEventListener('online', function () {
    if (!catalogData.loaded || (catalogData.movies.length === 0 && catalogData.tdt.length === 0)) {
      tvCatalogRetryCount = 0;
      loadTvCatalog();
    }
    if (typeof requestPairingCode === 'function' && !isPaired) {
      requestPairingCode(false);
    }
  });
}
