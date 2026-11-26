var TV_WEB_VERSION = '3.4.0';
var TV_APK_STORAGE_KEY = 'naim_tv_native_apk_code_v1';
var TV_WEB_VER_KEY = 'naim_tv_web_ver_v1';
var TV_WEB_BUILD_KEY = 'naim_tv_web_build_v1';
var TV_RELOAD_GUARD_KEY = 'naim_tv_reload_ts_v1';
var TV_LAST_CHANNEL_KEY = 'naim_tv_last_channel_v1';

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
var searchStr = (typeof window !== 'undefined' && window.location && window.location.search) ? window.location.search : '';
var pathStr = (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname : '';
var isTvLgPath = /^\/(tvlg|lgtv)\/?$/i.test(pathStr);
var isLgWebOsUa = /Web0S|WebOS|LGE|NetCast/i.test(uaStr);
var isExplicitNonWebOs = /[?&]webos=0\b/i.test(searchStr);
var storedWebOsFlag = false;
try {
  if (isExplicitNonWebOs) localStorage.removeItem('naim_is_webos_tv');
  else storedWebOsFlag = localStorage.getItem('naim_is_webos_tv') === '1';
} catch (e) {}
var isWebOsDevice =
  !isExplicitNonWebOs &&
  (isTvLgPath ||
    isLgWebOsUa ||
    storedWebOsFlag ||
    (typeof window !== 'undefined' &&
      (Boolean(window.webOS) || Boolean(window.PalmSystem) || Boolean(window.__RIFFAN_WEBOS_APP__))) ||
    /[?&](?:webos=1|lg=1|platform=webos)\b/i.test(searchStr));
try {
  if (isWebOsDevice) localStorage.setItem('naim_is_webos_tv', '1');
} catch (e) {}
var isTizenUa = /Tizen/i.test(uaStr);
var isExplicitNonTizen = /[?&]tizen=0\b/i.test(searchStr);
var storedTizenFlag = false;
try {
  if (isExplicitNonTizen) localStorage.removeItem('naim_is_tizen_tv');
  else storedTizenFlag = localStorage.getItem('naim_is_tizen_tv') === '1';
} catch (e) {}
var isTizenDevice =
  !isExplicitNonTizen &&
  (isTizenUa ||
    storedTizenFlag ||
    (typeof window !== 'undefined' && (Boolean(window.tizen) || Boolean(window.__RIFFAN_TIZEN_WIDGET__))) ||
    /[?&](?:tizen=1|platform=tizen)\b/i.test(searchStr));
try {
  if (isTizenDevice) localStorage.setItem('naim_is_tizen_tv', '1');
} catch (e) {}
var isSmartTvUa = isWebOsDevice || isLgWebOsUa || isTizenDevice || /Tizen|SMART-TV|GoogleTV|Android TV|BRAVIA|AFT|VIDAA/i.test(uaStr);
try {
  if (isSmartTvUa && document.documentElement) {
    var tvCls = document.documentElement.className || '';
    if (tvCls.indexOf('is-smart-tv') === -1) tvCls += (tvCls ? ' ' : '') + 'is-smart-tv';
    if (isTizenDevice && tvCls.indexOf('is-tizen-tv') === -1) tvCls += ' is-tizen-tv';
    if (isWebOsDevice && tvCls.indexOf('is-webos-tv') === -1) tvCls += ' is-webos-tv';
    document.documentElement.className = tvCls;
  }
} catch (e) {}

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
    docTitle: 'Riffan TV — Smart TV 1080p (Samsung Tizen & Google TV)',
    hubVer: 'Smart TV · TDT · DAZN · Movistar+ · Auto-sync',
    tabSearch: 'Buscar',
    tabHome: 'Inicio',
    tabTdt: 'TV en Directo',
    tabChampions: 'Champions',
    tabReleases: 'Estrenos',
    tabMovies: 'Cine',
    tabSeries: 'Series',
    tabAnime: 'Anime',
    tabKids: 'Niños',
    tabGames: 'Juegos',
    railVoice: 'Voz IA',
    railPair: 'Conectar Móvil',
    railLang: 'Idioma · ES',
    railFs: 'Pantalla',
    railForceUpdate: 'Actualizar App',
    forceUpdateBtn: '↻ Actualizar App',
    forceUpdatingBtn: 'Actualizando...',
    forceUpdatingToast: 'Limpiando caché y actualizando Riffan TV...',
    pairPill: 'Móvil · ',
    fsBtn: 'Pantalla',
    fsActive: 'TV Completa',
    langBtn: 'ES',
    langToast: 'Idioma: Español',
    initialLoading: 'Cargando TDT España, DAZN, Movistar+ y cartelera 1080p...',
    smBadge: 'SERIE HD',
    smBack: 'Volver',
    smLangEs: 'ES',
    smLangLat: 'LAT',
    smLangVose: 'VOSE',
    smLangEn: 'EN',
    hostSub: 'Receptor 1080p · Samsung Tizen, Google TV y LG webOS',
    connecting: 'Conectando...',
    tvReady: 'TV lista esperando móvil',
    backToMenu: 'Volver al Menú TV',
    webHome: 'Portada Web',
    pairEyebrow: 'VINCULACIÓN RÁPIDA EN 5 SEGUNDOS',
    pairHeading: 'Escanea el QR o escribe el código en tu móvil',
    pairSub: 'Abre tu sala de <strong>Riffan TV</strong> en el teléfono, toca el botón <strong>Smart TV</strong> y escribe este código:',
    unlockAudio: 'Activar Sonido + Pantalla',
    audioUnlocked: 'Sonido activado y listo',
    pairFs: 'Pantalla Completa TV',
    newCode: 'Nuevo código',
    directRoomLabel: '¿Prefieres entrar directo con código de sala?',
    directRoomPh: 'EJ: K8X4',
    enterBtn: 'Entrar',
    otaStatusTitle: 'Actualizaciones automáticas activas',
    otaStatusCheck: 'Sin reinstalar en Samsung Tizen · Comprobando...',
    otaStatusSynced: 'Al día automáticamente · Build ',
    otaStatusQueued: 'Nueva mejora lista · Se aplicará al volver al menú',
    otaCheckBtn: 'Forzar actualización',
    otaChecking: 'Buscando...',
    otaUpdatedToast: 'TV al día (v3.4 · Auto-update activo)',
    otaApplyingToast: 'Aplicando actualización automática...',
    autoSyncIdle: 'Auto-sync',
    autoSyncQueued: 'Actualización lista',
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
    standbySub: 'Sintonizando señal directa para Smart TV...',
    retryServer: 'Probar otra señal',
    hudBack: 'Volver',
    hudSubDefault: 'Reproducción HD',
    hudReload: 'Resincronizar',
    guideBtn: 'Guía TV',
    guideTitle: 'Guía de Canales',
    guideClose: 'Cerrar',
    chPrev: 'Canal Ant.',
    chNext: 'Canal Sig.',
    trackBtn: 'Pista',
    pauseBtn: 'Pausar',
    resumeBtn: 'Reanudar',
    playPauseBtn: 'Play / Pausa',
    muteBtn: 'Silenciar',
    aspectOrig: 'Original',
    aspectCover: 'Sin bordes',
    aspectFill: '16:9 Total',
    aspectToastOrig: 'Formato · Original',
    aspectToastCover: 'Formato · Sin bordes negros',
    aspectToastFill: 'Formato · 16:9 completo',
    unmuteNow: 'Pulsa OK para activar Sonido',
    confirmFs: 'Pulsa OK para Pantalla Completa',
    otaAvail: 'Nueva versión disponible',
    otaBtn: 'Actualizar ahora',
    liveNow: 'EN DIRECTO',
    liveBadge: 'DIRECTO',
    dialPrefix: 'DIAL ',
    broadcast247: 'Emisión 24/7 HD',
    nextPrefix: 'A continuación: ',
    seriesLabel: 'Serie',
    movieLabel: 'Película',
    heroSeriesMeta: 'SERIE DESTACADA',
    heroMovieMeta: 'ESTRENO EN CINE',
    heroDescFallback: 'Reproduce al instante en calidad 1080p desde tu Smart TV.',
    heroWatchSeasons: 'Ver Temporadas y Capítulos',
    heroPlayNow: 'Reproducir ahora',
    heroLiveAction: 'Ir a TDT · DAZN · M+',
    heroSurprise: 'Sorpréndeme',
    quickResumePre: 'Seguir viendo · ',
    quickTdtBtn: 'Toda la TDT España',
    quickSportsBtn: 'DAZN y Movistar+',
    quickChampionsBtn: 'Champions · Multi (1–4)',
    quickKidsBtn: 'Niños · Español',
    quickGamesBtn: 'Juegos TV',
    quickSearchBtn: 'Buscar canal o película',
    quickPairBtn: 'Conectar Móvil',
    secTdtEsTitle: 'TDT España en Directo',
    secTdtEsSub: 'La 1, La 2, Antena 3, Cuatro, Telecinco, laSexta y autonómicas HD',
    secSportsEsTitle: 'DAZN & Movistar+ · Fútbol y Motor',
    secSportsEsSub: 'LaLiga EA Sports, Champions League, Fórmula 1, MotoGP y Deportes',
    searchPh: 'Buscar canal (La 1, DAZN LaLiga, Movistar...), película o serie...',
    searchSubmit: 'Buscar',
    searchInstantLiveTitle: 'Canales en directo coincidentes',
    searching: 'Buscando en todo el catálogo...',
    searchResultsFor: 'Resultados para',
    secLiveTitle: 'TV & Deportes en Directo',
    secLiveSub: 'TDT España, DAZN, Movistar+ y canales internacionales',
    secReleasesTitle: 'Últimos Estrenos en Cine',
    secReleasesSub: 'Cartelera reciente lista en HD',
    secSeasonsTitle: 'Nuevas Temporadas de Series',
    secSeasonsSub: 'Estrenos y capítulos semanales',
    secMoviesTitle: 'Cine Destacado',
    secMoviesSub: 'Tendencias del día',
    secAnimeTitle: 'Anime en HD',
    secAnimeSub: 'Jujutsu Kaisen, Solo Leveling, DBZ, AOT',
    filterEsPriority: 'TDT · DAZN · Movistar+',
    filterEsTdt: 'TDT España',
    filterEsSports: 'DAZN & Movistar+',
    filterEsDocsCine: 'Cine & Doc. ES',
    filterRegionalEs: 'Autonómicas ES',
    filterAll: 'Todos',
    filterBeinAr: 'beIN العربية',
    filterMarruecos: 'Marruecos',
    filterDocs: 'Documentales',
    filterUsa: 'EE.UU.',
    filterEuropa: 'Europa',
    filterNoticias: 'Noticias',
    filterUkSports: 'UK Sports',
    filterChina: 'Fútbol China',
    filterIntlSports: 'Latam Sports',
    filterWorldCricket: 'Mundial & Cricket',
    filterElahmadMena: 'MENA & Árabe',
    filterAdrarEuropa: 'ADRAR Europa',
    filterFamelackMovies: 'Cine 24/7',
    filterCine: 'Cine & Series TV',
    liveSearchPh: 'Escribe para filtrar al instante (La 1, Antena 3, DAZN, Movistar, F1, TV3)...',
    liveSearchClear: 'Limpiar',
    loadMoreChannels: 'Ver +60 canales más',
    showingPrefix: 'Mostrando ',
    liveGridTitle: 'Canales en Directo 24/7',
    liveGridSubSuffix: ' canales · OK ver · Izquierda guía · 0-9 o ↑/↓ zapping',
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
    signalUnavailable: 'Señal temporalmente no disponible',
    standbySubFallback: 'Pulsa Volver para elegir otro canal o película.',
    roomPrefix: 'Sala ',
    tryingAltServer: 'Probando servidor alternativo...',
    loadingHdTv: 'Cargando señal HD en Smart TV...',
    connectingEngine: 'Conectando con el motor de streaming...',
    pickAnotherSource: 'Pulsa Volver para elegir otra fuente o idioma.',
    signalTempUnavail: 'Señal temporalmente no disponible',
    tuningLive: 'Sintonizando canal en directo...',
    nowPrefix: 'Ahora: ',
    noBroadcast: 'Señal temporalmente sin emisión.',
    volumeToast: 'Volumen · ',
    mutedToast: 'Silenciado',
    unmutedToast: 'Sonido activo',
    resyncCh: 'Resincronizando canal...',
    resyncHd: 'Resincronizando señal HD...',
    pairedWith: 'Vinculada con ',
    enteringRoom: 'Entrando a ',
    tvConnected: 'Smart TV Conectada · ',
    tvReadyTitle: 'Televisor listo para proyectar en 1080p',
    tvReadySub: 'Elige cualquier título desde tu móvil y empezará aquí automáticamente.',
    changingSignal: 'Cambiando señal...',
    changingTrack: 'Cambiando pista...',
    tvRemoteLabel: 'Mando TV',
    directLinkLabel: 'Enlace directo',
    yourPhone: 'tu móvil',
    noDialMatch: 'Sin canal en dial '
  },
  ca: {
    docTitle: 'Riffan TV — Smart TV 1080p (Samsung Tizen & Google TV)',
    hubVer: 'Smart TV · TDT · DAZN · Movistar+ · Auto-sync',
    tabSearch: 'Cercar',
    tabHome: 'Inici',
    tabTdt: 'TV en Directe',
    tabChampions: 'Champions',
    tabReleases: 'Estrenes',
    tabMovies: 'Cinema',
    tabSeries: 'Sèries',
    tabAnime: 'Anime',
    tabKids: 'Niños · ES',
    tabGames: 'Jocs',
    railVoice: 'Veu IA',
    railPair: 'Connectar Mòbil',
    railLang: 'Idioma · CA',
    railFs: 'Pantalla',
    railForceUpdate: 'Actualitzar App',
    forceUpdateBtn: '↻ Actualitzar App',
    forceUpdatingBtn: 'Actualitzant...',
    forceUpdatingToast: 'Netejant memòria i actualitzant Riffan TV...',
    pairPill: 'Mòbil · ',
    fsBtn: 'Pantalla',
    fsActive: 'TV Completa',
    langBtn: 'CA',
    langToast: 'Idioma: Català',
    initialLoading: 'Carregant TDT, DAZN, Movistar+ i cartellera 1080p...',
    smBadge: 'SÈRIE HD',
    smBack: 'Tornar',
    smLangEs: 'ES',
    smLangLat: 'LAT',
    smLangVose: 'VOSE',
    smLangEn: 'EN',
    hostSub: 'Receptor 1080p · Samsung Tizen, Google TV i LG webOS',
    connecting: 'Connectant...',
    tvReady: 'TV llesta esperant mòbil',
    backToMenu: 'Tornar al Menú TV',
    webHome: 'Portada Web',
    pairEyebrow: 'VINCULACIÓ RÀPIDA EN 5 SEGONS',
    pairHeading: 'Escaneja el QR o escriu el codi al mòbil',
    pairSub: 'Obre la sala de <strong>Riffan TV</strong> al telèfon, toca <strong>Smart TV</strong> i escriu aquest codi:',
    unlockAudio: 'Activar So + Pantalla',
    audioUnlocked: 'So activat i llest',
    pairFs: 'Pantalla Completa TV',
    newCode: 'Nou codi',
    directRoomLabel: 'Prefereixes entrar directe amb codi de sala?',
    directRoomPh: 'EX: K8X4',
    enterBtn: 'Entrar',
    otaStatusTitle: 'Actualitzacions automàtiques actives',
    otaStatusCheck: 'Sense reinstal·lar a Samsung Tizen · Comprovant...',
    otaStatusSynced: 'Al dia automàticament · Build ',
    otaStatusQueued: 'Nova millora llesta · S’aplicarà en tornar al menú',
    otaCheckBtn: 'Forçar actualització',
    otaChecking: 'Cercant...',
    otaUpdatedToast: 'TV al dia (Auto-update actiu)',
    otaApplyingToast: 'Aplicant actualització automàtica...',
    autoSyncIdle: 'Auto-sync',
    autoSyncQueued: 'Actualització llesta',
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
    standbySub: 'Sintonitzant senyal directe per a Smart TV...',
    retryServer: 'Provar un altre senyal',
    hudBack: 'Tornar',
    hudSubDefault: 'Reproducció HD',
    hudReload: 'Resincronitzar',
    guideBtn: 'Guia TV',
    guideTitle: 'Guia de Canals',
    guideClose: 'Tancar',
    chPrev: 'Canal Ant.',
    chNext: 'Canal Seg.',
    trackBtn: 'Pista',
    pauseBtn: 'Pausar',
    resumeBtn: 'Reprendre',
    playPauseBtn: 'Play / Pausa',
    muteBtn: 'Silenciar',
    aspectOrig: 'Original',
    aspectCover: 'Sense vores',
    aspectFill: '16:9 Total',
    aspectToastOrig: 'Format · Original',
    aspectToastCover: 'Format · Sense vores negres',
    aspectToastFill: 'Format · 16:9 complet',
    unmuteNow: 'Prem OK per activar So',
    confirmFs: 'Prem OK per Pantalla Completa',
    otaAvail: 'Nova versió disponible',
    otaBtn: 'Actualitzar ara',
    liveNow: 'EN DIRECTE',
    liveBadge: 'DIRECTE',
    dialPrefix: 'DIAL ',
    broadcast247: 'Emissió 24/7 HD',
    nextPrefix: 'Tot seguit: ',
    seriesLabel: 'Sèrie',
    movieLabel: 'Pel·lícula',
    heroSeriesMeta: 'SÈRIE DESTACADA',
    heroMovieMeta: 'ESTRENA AL CINEMA',
    heroDescFallback: 'Reprodueix a l’instant en qualitat 1080p des del teu Smart TV.',
    heroWatchSeasons: 'Veure Temporades i Capítols',
    heroPlayNow: 'Reproduir ara',
    heroLiveAction: 'Anar a TDT · DAZN · M+',
    heroSurprise: 'Sorprèn-me',
    quickResumePre: 'Seguir veient · ',
    quickTdtBtn: 'Tota la TDT Espanya',
    quickSportsBtn: 'DAZN i Movistar+',
    quickChampionsBtn: 'Champions · Multi (1–4)',
    quickKidsBtn: 'Niños · Español',
    quickGamesBtn: 'Jocs TV',
    quickSearchBtn: 'Cercar canal o pel·lícula',
    quickPairBtn: 'Connectar Mòbil',
    secTdtEsTitle: 'TDT Espanya en Directe',
    secTdtEsSub: 'La 1, La 2, Antena 3, Cuatro, Telecinco, laSexta i TV3Cat HD',
    secSportsEsTitle: 'DAZN & Movistar+ · Futbol i Motor',
    secSportsEsSub: 'LaLiga EA Sports, Champions League, Fórmula 1, MotoGP i Esports',
    searchPh: 'Cercar canal (La 1, TV3, DAZN LaLiga, Movistar...), pel·lícula o sèrie...',
    searchSubmit: 'Cercar',
    searchInstantLiveTitle: 'Canals en directe coincidents',
    searching: 'Cercant a tot el catàleg...',
    searchResultsFor: 'Resultats per a',
    secLiveTitle: 'TV & Esports en Directe',
    secLiveSub: 'TDT Espanya, TV3Cat, DAZN, Movistar+ i canals internacionals',
    secReleasesTitle: 'Últimes Estrenes de Cinema',
    secReleasesSub: 'Cartellera recent llesta en HD',
    secSeasonsTitle: 'Noves Temporades de Sèries',
    secSeasonsSub: 'Estrenes i capítols setmanals',
    secMoviesTitle: 'Cinema Destacat',
    secMoviesSub: 'Tendències del dia',
    secAnimeTitle: 'Anime en HD',
    secAnimeSub: 'Jujutsu Kaisen, Solo Leveling, DBZ, AOT',
    filterEsPriority: 'TDT · DAZN · Movistar+',
    filterEsTdt: 'TDT Espanya',
    filterEsSports: 'DAZN & Movistar+',
    filterEsDocsCine: 'Cinema & Doc. ES',
    filterRegionalEs: 'Autonòmiques ES',
    filterAll: 'Tots',
    filterBeinAr: 'beIN العربية',
    filterMarruecos: 'Marroc',
    filterDocs: 'Documentals',
    filterUsa: 'EUA',
    filterEuropa: 'Europa',
    filterNoticias: 'Notícies',
    filterUkSports: 'UK Sports',
    filterChina: 'Futbol Xina',
    filterIntlSports: 'Latam Sports',
    filterWorldCricket: 'Esports Mundial',
    filterElahmadMena: 'MENA & Àrab',
    filterAdrarEuropa: 'ADRAR Europa',
    filterFamelackMovies: 'Cinema 24/7',
    filterCine: 'Cinema & Sèries TV',
    liveSearchPh: 'Escriu per filtrar a l’instant (TV3, La 1, DAZN, Movistar, F1)...',
    liveSearchClear: 'Netejar',
    loadMoreChannels: 'Veure +60 canals més',
    showingPrefix: 'Mostrant ',
    liveGridTitle: 'Canals en Directe 24/7',
    liveGridSubSuffix: ' canals · OK veure · Esquerra guia · 0-9 o ↑/↓ zàping',
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
    signalUnavailable: 'Senyal temporalment no disponible',
    standbySubFallback: 'Prem Tornar per triar un altre canal o pel·lícula.',
    roomPrefix: 'Sala ',
    tryingAltServer: 'Provant servidor alternatiu...',
    loadingHdTv: 'Carregant senyal HD a Smart TV...',
    connectingEngine: 'Connectant amb el motor d’streaming...',
    pickAnotherSource: 'Prem Tornar per triar una altra font o idioma.',
    signalTempUnavail: 'Senyal temporalment no disponible',
    tuningLive: 'Sintonitzant canal en directe...',
    nowPrefix: 'Ara: ',
    noBroadcast: 'Senyal temporalment sense emissió.',
    volumeToast: 'Volum · ',
    mutedToast: 'Silenciat',
    unmutedToast: 'So actiu',
    resyncCh: 'Resincronitzant canal...',
    resyncHd: 'Resincronitzant senyal HD...',
    pairedWith: 'Vinculada amb ',
    enteringRoom: 'Entrant a ',
    tvConnected: 'Smart TV Connectada · ',
    tvReadyTitle: 'Televisor llest per projectar en 1080p',
    tvReadySub: 'Tria qualsevol títol des del mòbil i començarà aquí automàticament.',
    changingSignal: 'Canviant senyal...',
    changingTrack: 'Canviant pista...',
    tvRemoteLabel: 'Comandament TV',
    directLinkLabel: 'Enllaç directe',
    yourPhone: 'el teu mòbil',
    noDialMatch: 'Sense canal al dial '
  },
  en: {
    docTitle: 'Riffan TV — Smart TV 1080p (Samsung Tizen & Google TV)',
    hubVer: 'Smart TV · Spain DTT · DAZN · Movistar+ · Auto-sync',
    tabSearch: 'Search',
    tabHome: 'Home',
    tabTdt: 'Live TV',
    tabChampions: 'Champions',
    tabReleases: 'Releases',
    tabMovies: 'Movies',
    tabSeries: 'Series',
    tabAnime: 'Anime',
    tabKids: 'Niños (ES)',
    tabGames: 'Games',
    railVoice: 'Voice AI',
    railPair: 'Pair Phone',
    railLang: 'Lang · EN',
    railFs: 'Screen',
    railForceUpdate: 'Force Update',
    forceUpdateBtn: '↻ Force Update',
    forceUpdatingBtn: 'Updating...',
    forceUpdatingToast: 'Purging cache & updating Riffan TV...',
    pairPill: 'Phone · ',
    fsBtn: 'Fullscreen',
    fsActive: 'TV Full',
    langBtn: 'EN',
    langToast: 'Language: English',
    initialLoading: 'Loading Spain DTT, DAZN, Movistar+ and 1080p catalog...',
    smBadge: 'HD SERIES',
    smBack: 'Back',
    smLangEs: 'ES',
    smLangLat: 'LAT',
    smLangVose: 'VOSE',
    smLangEn: 'EN',
    hostSub: '1080p Receiver · Samsung Tizen, Google TV & LG webOS',
    connecting: 'Connecting...',
    tvReady: 'TV ready for phone pairing',
    backToMenu: 'Back to TV Menu',
    webHome: 'Web Home',
    pairEyebrow: '5-SECOND QUICK PAIRING',
    pairHeading: 'Scan the QR or enter the code on your phone',
    pairSub: 'Open your <strong>Riffan TV</strong> room on your phone, tap <strong>Smart TV</strong> and enter this code:',
    unlockAudio: 'Enable Sound + Fullscreen',
    audioUnlocked: 'Sound active and ready',
    pairFs: 'TV Fullscreen',
    newCode: 'New code',
    directRoomLabel: 'Prefer joining directly with a room code?',
    directRoomPh: 'EX: K8X4',
    enterBtn: 'Join',
    otaStatusTitle: 'Automatic updates enabled',
    otaStatusCheck: 'Zero reinstall on Samsung Tizen · Checking version...',
    otaStatusSynced: 'Automatically up to date · Build ',
    otaStatusQueued: 'New update ready · Applies when returning to menu',
    otaCheckBtn: 'Force update',
    otaChecking: 'Checking...',
    otaUpdatedToast: 'TV is up to date (Auto-update active)',
    otaApplyingToast: 'Applying automatic update...',
    autoSyncIdle: 'Auto-sync',
    autoSyncQueued: 'Update ready',
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
    standbySub: 'Tuning direct stream for Smart TV...',
    retryServer: 'Try another server',
    hudBack: 'Back',
    hudSubDefault: 'HD Playback',
    hudReload: 'Resync',
    guideBtn: 'TV Guide',
    guideTitle: 'Channel Guide',
    guideClose: 'Close',
    chPrev: 'Prev Ch',
    chNext: 'Next Ch',
    trackBtn: 'Track',
    pauseBtn: 'Pause',
    resumeBtn: 'Resume',
    playPauseBtn: 'Play / Pause',
    muteBtn: 'Mute',
    aspectOrig: 'Original',
    aspectCover: 'Crop Fit',
    aspectFill: '16:9 Fill',
    aspectToastOrig: 'Aspect · Original',
    aspectToastCover: 'Aspect · Borderless Crop',
    aspectToastFill: 'Aspect · 16:9 Fill',
    unmuteNow: 'Press OK to Unmute',
    confirmFs: 'Press OK for Fullscreen',
    otaAvail: 'New version available',
    otaBtn: 'Update now',
    liveNow: 'LIVE',
    liveBadge: 'LIVE',
    dialPrefix: 'CH ',
    broadcast247: '24/7 HD Broadcast',
    nextPrefix: 'Up next: ',
    seriesLabel: 'Series',
    movieLabel: 'Movie',
    heroSeriesMeta: 'FEATURED SERIES',
    heroMovieMeta: 'NEW IN CINEMA',
    heroDescFallback: 'Watch instantly in 1080p quality on your Smart TV.',
    heroWatchSeasons: 'Browse Seasons & Episodes',
    heroPlayNow: 'Watch Now',
    heroLiveAction: 'Spain DTT · DAZN · M+',
    heroSurprise: 'Surprise Me',
    quickResumePre: 'Continue watching · ',
    quickTdtBtn: 'All Spain DTT',
    quickSportsBtn: 'DAZN & Movistar+',
    quickChampionsBtn: 'Champions · Multi (1–4)',
    quickKidsBtn: 'Niños · Español',
    quickGamesBtn: 'TV Games',
    quickSearchBtn: 'Search Channel or Movie',
    quickPairBtn: 'Pair Phone',
    secTdtEsTitle: 'Spain DTT Live Channels',
    secTdtEsSub: 'La 1, La 2, Antena 3, Cuatro, Telecinco, laSexta & regional HD',
    secSportsEsTitle: 'DAZN & Movistar+ · Football & Motor',
    secSportsEsSub: 'LaLiga EA Sports, Champions League, Formula 1, MotoGP & Live Sports',
    searchPh: 'Search channels (La 1, DAZN LaLiga, Movistar...), movies, or series...',
    searchSubmit: 'Search',
    searchInstantLiveTitle: 'Matching live channels',
    searching: 'Searching catalog...',
    searchResultsFor: 'Results for',
    secLiveTitle: 'Live TV & Sports',
    secLiveSub: 'Spain DTT, DAZN, Movistar+ & International Channels',
    secReleasesTitle: 'Latest Cinema Releases',
    secReleasesSub: 'Recent releases ready in HD',
    secSeasonsTitle: 'New Series Seasons',
    secSeasonsSub: 'Premieres and weekly episodes',
    secMoviesTitle: 'Featured Movies',
    secMoviesSub: 'Trending today',
    secAnimeTitle: 'Anime in HD',
    secAnimeSub: 'Jujutsu Kaisen, Solo Leveling, DBZ, AOT',
    filterEsPriority: 'Spain DTT · DAZN · M+',
    filterEsTdt: 'Spain DTT',
    filterEsSports: 'DAZN & Movistar+',
    filterEsDocsCine: 'Movies & Docs ES',
    filterRegionalEs: 'Regional Spain',
    filterAll: 'All Channels',
    filterBeinAr: 'beIN Arabic',
    filterMarruecos: 'Morocco',
    filterDocs: 'Documentaries',
    filterUsa: 'USA',
    filterEuropa: 'Europe',
    filterNoticias: 'News',
    filterUkSports: 'UK Sports',
    filterChina: 'China Football',
    filterIntlSports: 'Latam Sports',
    filterWorldCricket: 'World & Cricket',
    filterElahmadMena: 'MENA & Arabic',
    filterAdrarEuropa: 'ADRAR Europe',
    filterFamelackMovies: 'Movies 24/7',
    filterCine: 'Live Movies & Series',
    liveSearchPh: 'Type to filter instantly (La 1, DAZN, Movistar, F1, Sky)...',
    liveSearchClear: 'Clear',
    loadMoreChannels: 'Show +60 more channels',
    showingPrefix: 'Showing ',
    liveGridTitle: '24/7 Live Channels',
    liveGridSubSuffix: ' channels · OK watch · Left guide · 0-9 or ↑/↓ zap',
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
    signalUnavailable: 'Signal temporarily unavailable',
    standbySubFallback: 'Press Back to choose another channel or movie.',
    roomPrefix: 'Room ',
    tryingAltServer: 'Trying backup server...',
    loadingHdTv: 'Loading HD stream on Smart TV...',
    connectingEngine: 'Connecting to streaming engine...',
    pickAnotherSource: 'Press Back to choose another source or language.',
    signalTempUnavail: 'Signal temporarily unavailable',
    tuningLive: 'Tuning live channel...',
    nowPrefix: 'Now: ',
    noBroadcast: 'Stream temporarily offline.',
    volumeToast: 'Volume · ',
    mutedToast: 'Muted',
    unmutedToast: 'Sound on',
    resyncCh: 'Resyncing channel...',
    resyncHd: 'Resyncing HD stream...',
    pairedWith: 'Paired with ',
    enteringRoom: 'Entering ',
    tvConnected: 'Smart TV Connected · ',
    tvReadyTitle: 'TV ready to stream in 1080p',
    tvReadySub: 'Choose any title on your phone and it will start here automatically.',
    changingSignal: 'Switching signal...',
    changingTrack: 'Switching track...',
    tvRemoteLabel: 'TV Remote',
    directLinkLabel: 'Direct link',
    yourPhone: 'your phone',
    noDialMatch: 'No channel on dial '
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
  setElText('btn-pairing-lang', tvT('langBtn'));
  setElText('hub-pair-label', tvT('pairPill'));

  setElText('lbl-rail-voice', tvT('railVoice'));
  setElText('lbl-rail-pair', tvT('railPair'));
  setElText('lbl-rail-lang', tvT('railLang'));
  setElText('lbl-rail-fs', tvT('railFs'));
  setElText('lbl-rail-force-update', tvT('railForceUpdate'));
  setElText('btn-tv-force-update', tvT('forceUpdateBtn'));

  var tabMap = {
    search: 'tabSearch',
    home: 'tabHome',
    tdt: 'tabTdt',
    champions: 'tabChampions',
    releases: 'tabReleases',
    movies: 'tabMovies',
    series: 'tabSeries',
    anime: 'tabAnime',
    kids: 'tabKids',
    games: 'tabGames'
  };
  var tabLabels = document.querySelectorAll('#hub-nav-tabs .rail-label[data-i18n-tab]');
  for (var i = 0; i < tabLabels.length; i++) {
    var dk = tabLabels[i].getAttribute('data-i18n-tab');
    if (dk && tabMap[dk]) tabLabels[i].textContent = tvT(tabMap[dk]);
  }
  if (typeof activeHubTab === 'string' && tabMap[activeHubTab]) {
    setElText('tv-stage-title', tvT(tabMap[activeHubTab]));
  }
  setElText('lbl-stage-search', tvT('tabSearch'));
  var stageSearchEl = document.getElementById('btn-stage-search');
  if (stageSearchEl) stageSearchEl.setAttribute('aria-label', tvT('tabSearch'));

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
  setElText('tv-ota-status-title', tvT('otaStatusTitle'));
  setElText('btn-check-tv-update', tvT('otaCheckBtn'));
  setElText('step1-title', tvT('step1Title'));
  setElText('step1-desc', tvT('step1DescPre') + (hostLabel || tvT('stepDomainFallback')) + tvT('step1DescPost'));
  setElText('step2-title', tvT('step2Title'));
  setElText('step2-desc', tvT('step2Desc'));
  setElText('step3-title', tvT('step3Title'));
  setElText('step3-desc', tvT('step3Desc'));

  setElText('mg-drawer-title', tvT('guideTitle'));
  setElText('btn-close-miniguide', tvT('guideClose'));
  setElText('btn-standby-retry', tvT('retryServer'));
  setElText('btn-standby-exit', tvT('backToMenu'));
  setElText('btn-hud-exit', tvT('hudBack'));
  setElText('btn-hud-reload', tvT('hudReload'));
  setElText('btn-dock-guide', tvT('guideBtn'));
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
