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

function filterTdtChannels(filterKey) {
  var all = catalogData.tdt || [];
  if (!filterKey || filterKey === 'all') return all;
  var out = [];
  for (var i = 0; i < all.length; i++) {
    var c = all[i];
    var cat = c.category || '';
    if (filterKey === 'es_tdt' && (cat === 'generalistas' || cat === 'noticias_deportes' || cat === 'entretenimiento')) out.push(c);
    else if (filterKey === 'es_sports' && (cat === 'movistar' || cat === 'dazn')) out.push(c);
    else if (filterKey === 'bein_arabic' && cat === 'bein_arabic') out.push(c);
    else if (filterKey === 'marruecos' && cat === 'marruecos') out.push(c);
    else if (filterKey === 'documentales' && cat === 'documentales') out.push(c);
    else if (filterKey === 'usa_tv' && cat === 'usa_tv') out.push(c);
    else if (filterKey === 'europa_tv' && cat === 'europa_tv') out.push(c);
    else if (filterKey === 'noticias_intl' && cat === 'noticias_intl') out.push(c);
    else if (filterKey === 'uk_sports' && cat === 'uk_sports') out.push(c);
    else if (filterKey === 'china_football' && cat === 'china_football') out.push(c);
    else if (filterKey === 'intl_sports' && (cat === 'espn' || cat === 'dsports' || cat === 'beinsports' || cat === 'tnt_space')) out.push(c);
    else if (filterKey === 'cine' && cat === 'cine_series') out.push(c);
    else if (filterKey === 'kids_reg' && cat === 'infantil_autonomicas') out.push(c);
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

function appendSection(parent, title, subtitle, items, kind, useGrid) {
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
  var limit = useGrid ? items.length : Math.min(18, items.length);
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
    var filters = [
      { key: 'all', label: tvT('filterAll') + ' (' + catalogData.tdt.length + ')' },
      { key: 'es_tdt', label: tvT('filterEsTdt') },
      { key: 'es_sports', label: tvT('filterEsSports') },
      { key: 'bein_arabic', label: tvT('filterBeinAr') },
      { key: 'marruecos', label: tvT('filterMarruecos') },
      { key: 'documentales', label: tvT('filterDocs') },
      { key: 'usa_tv', label: tvT('filterUsa') },
      { key: 'europa_tv', label: tvT('filterEuropa') },
      { key: 'noticias_intl', label: tvT('filterNoticias') },
      { key: 'uk_sports', label: tvT('filterUkSports') },
      { key: 'china_football', label: tvT('filterChina') },
      { key: 'intl_sports', label: tvT('filterIntlSports') },
      { key: 'cine', label: tvT('filterCine') },
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
    var filteredList = filterTdtChannels(activeLiveFilter);
    appendSection(
      hubDynamicContent,
      tvT('liveGridTitle'),
      filteredList.length + tvT('liveGridSubSuffix'),
      filteredList,
      'tdt',
      true
    );
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

function loadTvCatalog() {
  var pending = 5;
  function checkDone() {
    pending--;
    if (pending <= 0) {
      catalogData.loaded = true;
      renderHubContent();
    }
  }
  xhrJson('GET', '/api/catalog/latest-releases?lang=' + encodeURIComponent(activeTvLang), null, function (_e, d) {
    if (d) {
      if (Array.isArray(d.cinemaReleases)) catalogData.cinemaReleases = d.cinemaReleases;
      if (Array.isArray(d.newSeasons)) catalogData.newSeasons = d.newSeasons;
    }
    checkDone();
  });
  xhrJson('GET', '/api/catalog/movies?category=trending&page=1&lang=' + encodeURIComponent(activeTvLang), null, function (_e, d) {
    if (d && Array.isArray(d.movies)) catalogData.movies = d.movies;
    checkDone();
  });
  xhrJson('GET', '/api/catalog/series?category=trending&page=1&lang=' + encodeURIComponent(activeTvLang), null, function (_e, d) {
    if (d && Array.isArray(d.series)) catalogData.series = d.series;
    checkDone();
  });
  xhrJson('GET', '/api/catalog/series?provider=crunchyroll&category=trending&page=1&lang=' + encodeURIComponent(activeTvLang), null, function (_e, d) {
    if (d && Array.isArray(d.series)) catalogData.anime = d.series;
    checkDone();
  });
  xhrJson('GET', '/api/catalog/tdt', null, function (_e, d) {
    if (d && Array.isArray(d.channels)) catalogData.tdt = d.channels;
    checkDone();
  });
  loadLiveEpg();
  setInterval(loadLiveEpg, 3 * 60 * 1000);
}
