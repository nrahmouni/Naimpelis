var TV_WEB_VERSION = '3.1.1';
var TV_APK_STORAGE_KEY = 'naim_tv_native_apk_code_v1';
var TV_WEB_VER_KEY = 'naim_tv_web_ver_v1';
var TV_RELOAD_GUARD_KEY = 'naim_tv_reload_ts_v1';

try {
  if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
    navigator.serviceWorker.getRegistrations().then(function (regs) {
      for (var i = 0; i < regs.length; i++) {
        regs[i].unregister();
      }
    });
  }
} catch (e) {}

var uaStr = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
var isLgWebOsUa = /Web0S|WebOS|LGE|NetCast/i.test(uaStr);
var isSmartTvUa = isLgWebOsUa || /Tizen|SMART-TV|GoogleTV|Android TV|BRAVIA|AFT/i.test(uaStr);

var searchStr = window.location.search || '';
var installedApkCode = 0;
try {
  var apkvMatch = searchStr.match(/[?&]apkv=(\d+)/);
  installedApkCode = Number(localStorage.getItem(TV_APK_STORAGE_KEY) || '0');
  if (apkvMatch && apkvMatch[1]) {
    installedApkCode = Number(apkvMatch[1]);
    localStorage.setItem(TV_APK_STORAGE_KEY, String(installedApkCode));
  }
} catch (e) {}

var activeTvLang = 'es';
try {
  var qLangMatch = searchStr.match(/[?&]lang=(es|ca|en)\b/i);
  if (qLangMatch && qLangMatch[1]) {
    activeTvLang = qLangMatch[1].toLowerCase();
    localStorage.setItem('naim_lang', activeTvLang);
  } else {
    var storedLang = localStorage.getItem('naim_lang');
    if (storedLang === 'es' || storedLang === 'ca' || storedLang === 'en') {
      activeTvLang = storedLang;
    }
  }
} catch (e) {}

var TV_I18N = {
  es: {
    docTitle: 'NAIMCINE Google TV — Hub & Receptor 1080p',
    hubVer: 'Google TV v' + TV_WEB_VERSION + ' · D-Pad + Código TV',
    tabSearch: '🔍 Buscar',
    tabHome: 'Inicio',
    tabTdt: 'TDT Directo',
    tabReleases: 'Estrenos',
    tabMovies: 'Cine',
    tabSeries: 'Series',
    tabAnime: 'Anime',
    pairPill: '📺 Móvil · ',
    fsBtn: '⛶ Pantalla',
    fsActive: '✓ TV Full',
    langBtn: '🌐 ES',
    langToast: 'Idioma: Español',
    initialLoading: 'Cargando cartelera, series, anime y canales en directo...',
    smBadge: 'SERIE HD',
    smBack: '✕ Volver',
    smLangEs: 'ES',
    smLangLat: 'LAT',
    smLangVose: 'VOSE',
    smLangEn: 'EN',
    hostSub: 'Receptor 1080p para Google TV, LG webOS y Samsung',
    connecting: 'Conectando...',
    tvReady: '✓ TV lista esperando móvil',
    backToMenu: '← Volver al Menú TV',
    webHome: 'Portada Web',
    pairEyebrow: 'VINCULACIÓN RÁPIDA EN 5 SEGUNDOS',
    pairHeading: 'Introduce estos 4 números en tu móvil',
    pairSub: 'Abre tu sala de <strong>NAIMCINE</strong> en el teléfono, toca el botón <strong>Smart TV</strong> y escribe este código:',
    unlockAudio: '🔊 Activar Sonido + Pantalla Completa',
    audioUnlocked: '✓ Sonido activado y listo',
    pairFs: '⛶ Pantalla Completa TV',
    newCode: 'Nuevo código',
    directRoomLabel: '¿Prefieres entrar directo con código de sala?',
    directRoomPh: 'EJ: K8X4',
    enterBtn: 'Entrar',
    stepDomainFallback: 'la app web',
    step1Title: 'Abre tu sala en el móvil',
    step1DescPre: 'Entra en ',
    step1DescPost: ' desde tu smartphone.',
    step2Title: 'Pulsa el botón Smart TV',
    step2Desc: 'Arriba en la barra o en el reproductor y escribe los 4 dígitos.',
    step3Title: 'Tu móvil es el mando',
    step3Desc: 'Envía películas, series, fútbol o YouTube al televisor al instante.',
    standbyPill: 'Conectando señal HD...',
    standbyTitle: 'Preparando reproducción en 1080p',
    standbySub: 'Cargando servidor de emisión directo para Google TV...',
    retryServer: '↻ Probar otro servidor',
    hudBack: '← Volver',
    hudSubDefault: 'Reproducción HD',
    hudReload: '↻ Resincronizar',
    chPrev: '‹ Canal Ant.',
    chNext: 'Canal Sig. ›',
    trackBtn: '🌐 Pista',
    pauseBtn: '⏸ Pausar',
    resumeBtn: '▶ Reanudar',
    playPauseBtn: '⏯ Play / Pausa',
    muteBtn: '🔇 Silenciar',
    aspectOrig: '↔ Original',
    aspectCover: '↔ Sin bordes',
    aspectFill: '↔ 16:9 Total',
    aspectToastOrig: 'Formato · Original',
    aspectToastCover: 'Formato · Sin bordes negros',
    aspectToastFill: 'Formato · 16:9 completo',
    unmuteNow: '🔊 Pulsa OK para activar Sonido',
    confirmFs: '⛶ Pulsa OK para Pantalla Completa',
    otaAvail: 'Nueva versión APK disponible',
    otaBtn: 'Actualizar APK',
    liveNow: 'EN VIVO',
    liveBadge: 'DIRECTO',
    dialPrefix: 'DIAL ',
    broadcast247: 'Emisión 24/7 HD',
    seriesLabel: 'Serie',
    movieLabel: 'Película',
    heroSeriesMeta: 'SERIE DESTACADA',
    heroMovieMeta: 'ESTRENO EN CINE',
    heroDescFallback: 'Reproduce al instante en calidad 1080p desde tu Google TV.',
    heroWatchSeasons: '📺 Ver Temporadas y Capítulos',
    heroPlayNow: '▶ Reproducir ahora',
    heroSurprise: '🎲 Sorpréndeme',
    searchPh: 'Buscar películas, series, anime o canales (Sky Sports, La 1, From...)',
    searchSubmit: '🔍 Buscar',
    searching: 'Buscando en todo el catálogo...',
    searchResultsFor: 'Resultados para',
    secLiveTitle: 'TV & Deportes en Directo',
    secLiveSub: 'TDT, beIN العربية, Marruecos, National Geographic, FOX, Al Jazeera y más',
    secReleasesTitle: 'Últimos Estrenos en Cine',
    secReleasesSub: 'Cartelera reciente lista en HD',
    secSeasonsTitle: 'Nuevas Temporadas de Series',
    secSeasonsSub: 'Estrenos y capítulos semanales',
    secMoviesTitle: 'Cine Destacado',
    secMoviesSub: 'Tendencias del día',
    secAnimeTitle: 'Anime en HD',
    secAnimeSub: 'Jujutsu Kaisen, Solo Leveling, DBZ, AOT',
    filterAll: 'Todos',
    filterEsTdt: '🇪🇸 TDT España',
    filterEsSports: '⚽ Fútbol & Motor ES',
    filterBeinAr: '🇶🇦 beIN العربية',
    filterMarruecos: '🇲🇦 Marruecos',
    filterDocs: '🌍 Documentales & NatGeo',
    filterUsa: '🇺🇸 EE.UU. FOX / CNN',
    filterEuropa: '🇪🇺 Europa',
    filterNoticias: '📰 Al Jazeera & Noticias',
    filterUkSports: '🇬🇧 UK Sports',
    filterChina: '🇨🇳 Fútbol China',
    filterIntlSports: '🌎 Latam Sports',
    filterCine: '🎬 Cine & Series',
    filterKidsReg: '👶 Infantil & Auton.',
    liveGridTitle: 'Canales en Directo 24/7',
    liveGridSubSuffix: ' canales · Pulsa OK para ver, ↑/↓ en vídeo para zapping',
    releasesAllSub: 'Todos los estrenos recientes',
    seasonsAllTitle: 'Nuevas Temporadas Recientes',
    seasonsAllSub: 'Series recién estrenadas',
    moviesCatalogTitle: 'Catálogo de Cine',
    moviesCatalogSub: 'Navega con las flechas del mando',
    seriesCatalogTitle: 'Series Completas',
    seriesCatalogSub: 'Elige temporada y episodio',
    animeCatalogSub: 'Castellano / Sub Español',
    loadingEpisodes: 'Cargando episodios...',
    loadingSeasons: 'Cargando temporadas y episodios...',
    noTmdbId: 'Esta serie no tiene TMDB ID vinculado.',
    loadingSeasonNum: 'Cargando Temporada ',
    seasonFallback: 'Temporada ',
    episodeFallback: 'Episodio ',
    episodesLoadErr: 'No se pudieron cargar los episodios.',
    noEpisodesSeason: 'No hay episodios disponibles en esta temporada.',
    langChosen: 'Idioma elegido: ',
    switchingBackup: 'Cambiando a señal de respaldo...',
    connectingIptv: 'Conectando vía pasarela IPTV directa...',
    switchingServer: 'Cambiando a servidor alternativo...',
    noServerAvail: 'Ningún servidor respondió para este título en este momento.',
    signalUnavailable: '⚠ Señal temporalmente no disponible',
    standbySubFallback: 'Pulsa Volver para elegir otro canal o película.',
    roomPrefix: 'Sala ',
    tryingAltServer: '⏳ Probando servidor alternativo...',
    loadingHdTv: '⏳ Cargando señal HD en Google TV...',
    connectingEngine: 'Conectando con el motor de streaming NAIMCINE...',
    pickAnotherSource: 'Pulsa Volver para elegir otra fuente o idioma.',
    signalTempUnavail: 'Señal temporalmente no disponible',
    tuningLive: '📡 Sintonizando canal en directo...',
    nowPrefix: 'Ahora: ',
    noBroadcast: 'Señal temporalmente sin emisión.',
    volumeToast: '🔊 Volumen · ',
    mutedToast: '🔇 Silenciado',
    unmutedToast: '🔊 Sonido activo',
    resyncCh: 'Resincronizando canal...',
    resyncHd: 'Resincronizando señal HD...',
    pairedWith: '✓ Vinculada con ',
    enteringRoom: 'Entrando a ',
    tvConnected: '✓ Smart TV Conectada · ',
    tvReadyTitle: 'Televisor listo para proyectar en 1080p',
    tvReadySub: 'Elige cualquier título desde tu móvil y empezará aquí automáticamente.',
    changingSignal: 'Cambiando señal...',
    changingTrack: 'Cambiando pista...',
    tvRemoteLabel: 'Mando TV',
    directLinkLabel: 'Enlace directo',
    yourPhone: 'tu móvil'
  },
  ca: {
    docTitle: 'NAIMCINE Google TV — Hub & Receptor 1080p',
    hubVer: 'Google TV v' + TV_WEB_VERSION + ' · D-Pad + Codi TV',
    tabSearch: '🔍 Cercar',
    tabHome: 'Inici',
    tabTdt: 'TDT Directe',
    tabReleases: 'Estrenes',
    tabMovies: 'Cinema',
    tabSeries: 'Sèries',
    tabAnime: 'Anime',
    pairPill: '📺 Mòbil · ',
    fsBtn: '⛶ Pantalla',
    fsActive: '✓ TV Full',
    langBtn: '🌐 CA',
    langToast: 'Idioma: Català',
    initialLoading: 'Carregant cartellera, sèries, anime i canals en directe...',
    smBadge: 'SÈRIE HD',
    smBack: '✕ Tornar',
    smLangEs: 'ES',
    smLangLat: 'LAT',
    smLangVose: 'VOSE',
    smLangEn: 'EN',
    hostSub: 'Receptor 1080p per a Google TV, Samsung i LG',
    connecting: 'Connectant...',
    tvReady: '✓ TV llesta esperant mòbil',
    backToMenu: '← Tornar al Menú TV',
    webHome: 'Portada Web',
    pairEyebrow: 'VINCULACIÓ RÀPIDA EN 5 SEGONS',
    pairHeading: 'Introdueix aquests 4 números al teu mòbil',
    pairSub: 'Obre la teva sala de <strong>NAIMCINE</strong> al telèfon, toca el botó <strong>Smart TV</strong> i escriu aquest codi:',
    unlockAudio: '🔊 Activar So + Pantalla Completa',
    audioUnlocked: '✓ So activat i llest',
    pairFs: '⛶ Pantalla Completa TV',
    newCode: 'Nou codi',
    directRoomLabel: 'Prefereixes entrar directe amb codi de sala?',
    directRoomPh: 'EX: K8X4',
    enterBtn: 'Entrar',
    stepDomainFallback: 'l’app web',
    step1Title: 'Obre la sala al mòbil',
    step1DescPre: 'Entra a ',
    step1DescPost: ' des del teu telèfon.',
    step2Title: 'Prem el botó Smart TV',
    step2Desc: 'Amunt a la barra o al reproductor i escriu els 4 dígits.',
    step3Title: 'El teu mòbil és el comandament',
    step3Desc: 'Envia pel·lícules, sèries, futbol o YouTube al televisor a l’instant.',
    standbyPill: 'Connectant senyal HD...',
    standbyTitle: 'Preparant reproducció en 1080p',
    standbySub: 'Carregant servidor d’emissió directe per a Google TV...',
    retryServer: '↻ Provar un altre servidor',
    hudBack: '← Tornar',
    hudSubDefault: 'Reproducció HD',
    hudReload: '↻ Resincronitzar',
    chPrev: '‹ Canal Ant.',
    chNext: 'Canal Seg. ›',
    trackBtn: '🌐 Pista',
    pauseBtn: '⏸ Pausar',
    resumeBtn: '▶ Reprendre',
    playPauseBtn: '⏯ Play / Pausa',
    muteBtn: '🔇 Silenciar',
    aspectOrig: '↔ Original',
    aspectCover: '↔ Sense vores',
    aspectFill: '↔ 16:9 Total',
    aspectToastOrig: 'Format · Original',
    aspectToastCover: 'Format · Sense vores negres',
    aspectToastFill: 'Format · 16:9 complet',
    unmuteNow: '🔊 Prem OK per activar So',
    confirmFs: '⛶ Prem OK per Pantalla Completa',
    otaAvail: 'Nova versió APK disponible',
    otaBtn: 'Actualitzar APK',
    liveNow: 'EN DIRECTE',
    liveBadge: 'DIRECTE',
    dialPrefix: 'DIAL ',
    broadcast247: 'Emissió 24/7 HD',
    seriesLabel: 'Sèrie',
    movieLabel: 'Pel·lícula',
    heroSeriesMeta: 'SÈRIE DESTACADA',
    heroMovieMeta: 'ESTRENA AL CINEMA',
    heroDescFallback: 'Reprodueix a l’instant en qualitat 1080p des del teu Google TV.',
    heroWatchSeasons: '📺 Veure Temporades i Capítols',
    heroPlayNow: '▶ Reproduir ara',
    heroSurprise: '🎲 Sorprèn-me',
    searchPh: 'Cercar pel·lícules, sèries, anime o canals (Sky Sports, TV3, La 1...)',
    searchSubmit: '🔍 Cercar',
    searching: 'Cercant a tot el catàleg...',
    searchResultsFor: 'Resultats per a',
    secLiveTitle: 'TV & Esports en Directe',
    secLiveSub: 'TDT, 3Cat, beIN العربية, Marroc, Nat Geo, FOX, Al Jazeera i més',
    secReleasesTitle: 'Últimes Estrenes de Cinema',
    secReleasesSub: 'Cartellera recent llesta en HD',
    secSeasonsTitle: 'Noves Temporades de Sèries',
    secSeasonsSub: 'Estrenes i capítols setmanals',
    secMoviesTitle: 'Cinema Destacat',
    secMoviesSub: 'Tendències del dia',
    secAnimeTitle: 'Anime en HD',
    secAnimeSub: 'Jujutsu Kaisen, Solo Leveling, DBZ, AOT',
    filterAll: 'Tots',
    filterEsTdt: '🇪🇸 TDT Espanya',
    filterEsSports: '⚽ Futbol & Motor ES',
    filterBeinAr: '🇶🇦 beIN العربية',
    filterMarruecos: '🇲🇦 Marroc',
    filterDocs: '🌍 Documentals & NatGeo',
    filterUsa: '🇺🇸 EUA FOX / CNN',
    filterEuropa: '🇪🇺 Europa',
    filterNoticias: '📰 Al Jazeera & Notícies',
    filterUkSports: '🇬🇧 UK Sports',
    filterChina: '🇨🇳 Futbol Xina',
    filterIntlSports: '🌎 Latam Sports',
    filterCine: '🎬 Cinema & Sèries',
    filterKidsReg: '👶 Infantil & Auton.',
    liveGridTitle: 'Canals en Directe 24/7',
    liveGridSubSuffix: ' canals · Prem OK per veure, ↑/↓ al vídeo per fer zàping',
    releasesAllSub: 'Totes les estrenes recents',
    seasonsAllTitle: 'Noves Temporades Recents',
    seasonsAllSub: 'Sèries acabades d’estrenar',
    moviesCatalogTitle: 'Catàleg de Cinema',
    moviesCatalogSub: 'Navega amb les fletxes del comandament',
    seriesCatalogTitle: 'Sèries Completes',
    seriesCatalogSub: 'Tria temporada i episodi',
    animeCatalogSub: 'Català / Castellà / Subtítols',
    loadingEpisodes: 'Carregant episodis...',
    loadingSeasons: 'Carregant temporades i episodis...',
    noTmdbId: 'Aquesta sèrie no té TMDB ID vinculat.',
    loadingSeasonNum: 'Carregant Temporada ',
    seasonFallback: 'Temporada ',
    episodeFallback: 'Episodi ',
    episodesLoadErr: 'No s’han pogut carregar els episodis.',
    noEpisodesSeason: 'No hi ha episodis disponibles en aquesta temporada.',
    langChosen: 'Idioma escollit: ',
    switchingBackup: 'Canviant a senyal de suport...',
    connectingIptv: 'Connectant via passarel·la IPTV directa...',
    switchingServer: 'Canviant a servidor alternatiu...',
    noServerAvail: 'Cap servidor ha respost per a aquest títol ara mateix.',
    signalUnavailable: '⚠ Senyal temporalment no disponible',
    standbySubFallback: 'Prem Tornar per triar un altre canal o pel·lícula.',
    roomPrefix: 'Sala ',
    tryingAltServer: '⏳ Provant servidor alternatiu...',
    loadingHdTv: '⏳ Carregant senyal HD a Google TV...',
    connectingEngine: 'Connectant amb el motor d’streaming NAIMCINE...',
    pickAnotherSource: 'Prem Tornar per triar una altra font o idioma.',
    signalTempUnavail: 'Senyal temporalment no disponible',
    tuningLive: '📡 Sintonitzant canal en directe...',
    nowPrefix: 'Ara: ',
    noBroadcast: 'Senyal temporalment sense emissió.',
    volumeToast: '🔊 Volum · ',
    mutedToast: '🔇 Silenciat',
    unmutedToast: '🔊 So actiu',
    resyncCh: 'Resincronitzant canal...',
    resyncHd: 'Resincronitzant senyal HD...',
    pairedWith: '✓ Vinculada amb ',
    enteringRoom: 'Entrant a ',
    tvConnected: '✓ Smart TV Connectada · ',
    tvReadyTitle: 'Televisor llest per projectar en 1080p',
    tvReadySub: 'Tria qualsevol títol des del mòbil i començarà aquí automàticament.',
    changingSignal: 'Canviant senyal...',
    changingTrack: 'Canviant pista...',
    tvRemoteLabel: 'Comandament TV',
    directLinkLabel: 'Enllaç directe',
    yourPhone: 'el teu mòbil'
  },
  en: {
    docTitle: 'NAIMCINE Google TV — 1080p Hub & Receiver',
    hubVer: 'Google TV v' + TV_WEB_VERSION + ' · D-Pad + TV Code',
    tabSearch: '🔍 Search',
    tabHome: 'Home',
    tabTdt: 'Live TV',
    tabReleases: 'Releases',
    tabMovies: 'Movies',
    tabSeries: 'Series',
    tabAnime: 'Anime',
    pairPill: '📺 Phone · ',
    fsBtn: '⛶ Fullscreen',
    fsActive: '✓ TV Full',
    langBtn: '🌐 EN',
    langToast: 'Language: English',
    initialLoading: 'Loading releases, series, anime, and live channels...',
    smBadge: 'HD SERIES',
    smBack: '✕ Back',
    smLangEs: 'ES',
    smLangLat: 'LAT',
    smLangVose: 'VOSE',
    smLangEn: 'EN',
    hostSub: '1080p Receiver for Google TV, Samsung & LG',
    connecting: 'Connecting...',
    tvReady: '✓ TV ready for phone pairing',
    backToMenu: '← Back to TV Menu',
    webHome: 'Web Home',
    pairEyebrow: '5-SECOND QUICK PAIRING',
    pairHeading: 'Enter these 4 digits on your phone',
    pairSub: 'Open your <strong>NAIMCINE</strong> room on your phone, tap <strong>Smart TV</strong> and enter this code:',
    unlockAudio: '🔊 Enable Sound + Fullscreen',
    audioUnlocked: '✓ Sound active and ready',
    pairFs: '⛶ TV Fullscreen',
    newCode: 'New code',
    directRoomLabel: 'Prefer joining directly with a room code?',
    directRoomPh: 'EX: K8X4',
    enterBtn: 'Join',
    stepDomainFallback: 'the web app',
    step1Title: 'Open your room on mobile',
    step1DescPre: 'Visit ',
    step1DescPost: ' on your smartphone.',
    step2Title: 'Tap Smart TV',
    step2Desc: 'In the top bar or player and type the 4 digits.',
    step3Title: 'Your phone is the remote',
    step3Desc: 'Cast movies, series, football, or YouTube to your TV instantly.',
    standbyPill: 'Connecting HD stream...',
    standbyTitle: 'Preparing 1080p playback',
    standbySub: 'Loading direct stream server for Google TV...',
    retryServer: '↻ Try another server',
    hudBack: '← Back',
    hudSubDefault: 'HD Playback',
    hudReload: '↻ Resync',
    chPrev: '‹ Prev Ch',
    chNext: 'Next Ch ›',
    trackBtn: '🌐 Track',
    pauseBtn: '⏸ Pause',
    resumeBtn: '▶ Resume',
    playPauseBtn: '⏯ Play / Pause',
    muteBtn: '🔇 Mute',
    aspectOrig: '↔ Original',
    aspectCover: '↔ Crop Fit',
    aspectFill: '↔ 16:9 Fill',
    aspectToastOrig: 'Aspect · Original',
    aspectToastCover: 'Aspect · Borderless Crop',
    aspectToastFill: 'Aspect · 16:9 Fill',
    unmuteNow: '🔊 Press OK to Unmute',
    confirmFs: '⛶ Press OK for Fullscreen',
    otaAvail: 'New APK version available',
    otaBtn: 'Update APK',
    liveNow: 'LIVE',
    liveBadge: 'LIVE',
    dialPrefix: 'CH ',
    broadcast247: '24/7 HD Broadcast',
    seriesLabel: 'Series',
    movieLabel: 'Movie',
    heroSeriesMeta: 'FEATURED SERIES',
    heroMovieMeta: 'NEW IN CINEMA',
    heroDescFallback: 'Watch instantly in 1080p quality on your Google TV.',
    heroWatchSeasons: '📺 Browse Seasons & Episodes',
    heroPlayNow: '▶ Watch Now',
    heroSurprise: '🎲 Surprise Me',
    searchPh: 'Search movies, series, anime, or channels (Sky Sports, La 1, From...)',
    searchSubmit: '🔍 Search',
    searching: 'Searching catalog...',
    searchResultsFor: 'Results for',
    secLiveTitle: 'Live TV & Sports',
    secLiveSub: 'Spanish DTT, beIN Arabic, Morocco, Nat Geo, FOX, Al Jazeera & more',
    secReleasesTitle: 'Latest Cinema Releases',
    secReleasesSub: 'Recent releases ready in HD',
    secSeasonsTitle: 'New Series Seasons',
    secSeasonsSub: 'Premieres and weekly episodes',
    secMoviesTitle: 'Featured Movies',
    secMoviesSub: 'Trending today',
    secAnimeTitle: 'Anime in HD',
    secAnimeSub: 'Jujutsu Kaisen, Solo Leveling, DBZ, AOT',
    filterAll: 'All',
    filterEsTdt: '🇪🇸 Spain DTT',
    filterEsSports: '⚽ Football & Motor ES',
    filterBeinAr: '🇶🇦 beIN Arabic',
    filterMarruecos: '🇲🇦 Morocco',
    filterDocs: '🌍 Documentaries & NatGeo',
    filterUsa: '🇺🇸 USA FOX / CNN',
    filterEuropa: '🇪🇺 Europe',
    filterNoticias: '📰 Al Jazeera & News',
    filterUkSports: '🇬🇧 UK Sports',
    filterChina: '🇨🇳 China Football',
    filterIntlSports: '🌎 Latam Sports',
    filterCine: '🎬 Movies & Series',
    filterKidsReg: '👶 Regional & Kids',
    liveGridTitle: '24/7 Live Channels',
    liveGridSubSuffix: ' channels · Press OK to watch, ↑/↓ in player to zap',
    releasesAllSub: 'All recent releases',
    seasonsAllTitle: 'Recent New Seasons',
    seasonsAllSub: 'Newly released series',
    moviesCatalogTitle: 'Movie Catalog',
    moviesCatalogSub: 'Browse with remote arrows',
    seriesCatalogTitle: 'Full Series',
    seriesCatalogSub: 'Pick season and episode',
    animeCatalogSub: 'Subtitled & Dubbed HD',
    loadingEpisodes: 'Loading episodes...',
    loadingSeasons: 'Loading seasons & episodes...',
    noTmdbId: 'This series has no linked TMDB ID.',
    loadingSeasonNum: 'Loading Season ',
    seasonFallback: 'Season ',
    episodeFallback: 'Episode ',
    episodesLoadErr: 'Could not load episodes.',
    noEpisodesSeason: 'No episodes available in this season.',
    langChosen: 'Selected language: ',
    switchingBackup: 'Switching to backup signal...',
    connectingIptv: 'Connecting via direct IPTV gateway...',
    switchingServer: 'Switching to backup server...',
    noServerAvail: 'No server responded for this title right now.',
    signalUnavailable: '⚠ Signal temporarily unavailable',
    standbySubFallback: 'Press Back to choose another channel or movie.',
    roomPrefix: 'Room ',
    tryingAltServer: '⏳ Trying backup server...',
    loadingHdTv: '⏳ Loading HD stream on Google TV...',
    connectingEngine: 'Connecting to NAIMCINE streaming engine...',
    pickAnotherSource: 'Press Back to choose another source or language.',
    signalTempUnavail: 'Signal temporarily unavailable',
    tuningLive: '📡 Tuning live channel...',
    nowPrefix: 'Now: ',
    noBroadcast: 'Stream temporarily offline.',
    volumeToast: '🔊 Volume · ',
    mutedToast: '🔇 Muted',
    unmutedToast: '🔊 Sound on',
    resyncCh: 'Resyncing channel...',
    resyncHd: 'Resyncing HD stream...',
    pairedWith: '✓ Paired with ',
    enteringRoom: 'Entering ',
    tvConnected: '✓ Smart TV Connected · ',
    tvReadyTitle: 'TV ready to stream in 1080p',
    tvReadySub: 'Choose any title on your phone and it will start here automatically.',
    changingSignal: 'Switching signal...',
    changingTrack: 'Switching track...',
    tvRemoteLabel: 'TV Remote',
    directLinkLabel: 'Direct link',
    yourPhone: 'your phone'
  }
};

function tvT(key) {
  var dict = TV_I18N[activeTvLang] || TV_I18N.es;
  return dict[key] !== undefined ? dict[key] : (TV_I18N.es[key] || key);
}

function setElText(id, txt) {
  var el = document.getElementById(id);
  if (el) el.textContent = txt;
}

var hostLabel = window.location.host || 'localhost';

function applyTvLanguage(nextLang) {
  if (nextLang === 'es' || nextLang === 'ca' || nextLang === 'en') {
    activeTvLang = nextLang;
    try { localStorage.setItem('naim_lang', activeTvLang); } catch (e) {}
  }
  try { document.documentElement.lang = activeTvLang; } catch (e) {}
  try { document.title = tvT('docTitle'); } catch (e) {}

  setElText('hub-version-label', tvT('hubVer'));
  setElText('host-url-label', hostLabel + '/tv · ' + tvT('hostSub'));
  setElText('step-domain-label', hostLabel || tvT('stepDomainFallback'));
  setElText('btn-hub-lang', tvT('langBtn'));
  setElText('btn-pairing-lang', tvT('langBtn'));
  setElText('hub-pair-label', tvT('pairPill'));
  setElText('hub-initial-loading', tvT('initialLoading'));

  var tabMap = {
    search: 'tabSearch',
    home: 'tabHome',
    tdt: 'tabTdt',
    releases: 'tabReleases',
    movies: 'tabMovies',
    series: 'tabSeries',
    anime: 'tabAnime'
  };
  var tabEls = document.querySelectorAll('#hub-nav-tabs .hub-tab-btn');
  for (var i = 0; i < tabEls.length; i++) {
    var dk = tabEls[i].getAttribute('data-tab');
    if (dk && tabMap[dk]) tabEls[i].textContent = tvT(tabMap[dk]);
  }

  setElText('btn-close-series-modal', tvT('smBack'));
  var langBtnEls = document.querySelectorAll('#sm-lang-row .series-pill-btn');
  for (var j = 0; j < langBtnEls.length; j++) {
    var dl = langBtnEls[j].getAttribute('data-lang');
    if (dl === 'ES') langBtnEls[j].textContent = tvT('smLangEs');
    else if (dl === 'LAT') langBtnEls[j].textContent = tvT('smLangLat');
    else if (dl === 'VOSE') langBtnEls[j].textContent = tvT('smLangVose');
    else if (dl === 'EN') langBtnEls[j].textContent = tvT('smLangEn');
  }

  setElText('btn-back-to-hub', tvT('backToMenu'));
  setElText('btn-web-mode', tvT('webHome'));
  setElText('pair-eyebrow', tvT('pairEyebrow'));
  setElText('pair-heading', tvT('pairHeading'));
  var pairSubEl = document.getElementById('pair-sub');
  if (pairSubEl) pairSubEl.innerHTML = tvT('pairSub');
  setElText('btn-pairing-fs', tvT('pairFs'));
  setElText('btn-new-code', tvT('newCode'));
  setElText('direct-room-label', tvT('directRoomLabel'));
  var dirInput = document.getElementById('direct-room-input');
  if (dirInput) dirInput.placeholder = tvT('directRoomPh');
  setElText('btn-direct-room-submit', tvT('enterBtn'));
  setElText('step1-title', tvT('step1Title'));
  setElText('step1-desc', tvT('step1DescPre') + (hostLabel || tvT('stepDomainFallback')) + tvT('step1DescPost'));
  setElText('step2-title', tvT('step2Title'));
  setElText('step2-desc', tvT('step2Desc'));
  setElText('step3-title', tvT('step3Title'));
  setElText('step3-desc', tvT('step3Desc'));

  setElText('btn-standby-retry', tvT('retryServer'));
  setElText('btn-standby-exit', tvT('backToMenu'));
  setElText('btn-hud-exit', tvT('hudBack'));
  setElText('btn-hud-reload', tvT('hudReload'));
  setElText('btn-dock-chprev', tvT('chPrev'));
  setElText('btn-dock-chnext', tvT('chNext'));
  setElText('btn-dock-mute', tvT('muteBtn'));
  setElText('btn-unmute-now', tvT('unmuteNow'));
  setElText('btn-confirm-remote-fs', tvT('confirmFs'));
  setElText('btn-ota-install', tvT('otaBtn'));

  var btnAudioEl = document.getElementById('btn-unlock-audio');
  if (btnAudioEl && typeof audioUnlocked !== 'undefined') {
    btnAudioEl.textContent = audioUnlocked ? tvT('audioUnlocked') : tvT('unlockAudio');
  }
  if (typeof syncFullscreenButtons === 'function') syncFullscreenButtons();
  if (typeof syncPlayPauseButton === 'function') syncPlayPauseButton();
  if (typeof setServerReady === 'function') setServerReady(Boolean(pairingCode));
  if (typeof catalogData !== 'undefined' && catalogData.loaded && typeof renderHubContent === 'function') {
    renderHubContent();
  }
}
