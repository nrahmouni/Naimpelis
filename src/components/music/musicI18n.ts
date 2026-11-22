import type { AppLanguage } from '../../types';

export type MusicLang = 'es' | 'en' | 'fr' | 'zh' | 'ca';

export const MUSIC_LANGUAGES: Array<{ id: MusicLang; code: string; label: string }> = [
  { id: 'en', code: 'EN', label: 'English' },
  { id: 'es', code: 'ES', label: 'Español' },
  { id: 'fr', code: 'FR', label: 'Français' },
  { id: 'zh', code: 'ZH', label: '中文' },
  { id: 'ca', code: 'CA', label: 'Català' },
];

export function normalizeMusicLang(appLang?: AppLanguage | string): MusicLang {
  if (appLang === 'en' || appLang === 'fr' || appLang === 'zh' || appLang === 'ca' || appLang === 'es') {
    return appLang;
  }
  if (appLang === 'rif') return 'fr';
  return 'en';
}

export interface MusicCopy {
  goodMorning: string;
  goodAfternoon: string;
  goodEvening: string;
  spatialAudioLabel: string;
  playingNow: string;
  worldTrending: string;
  heroFallbackSub: string;
  playNow: string;
  pause: string;
  shuffleMix: string;
  radios247: string;
  navHome: string;
  navExplore: string;
  navExploreLong: string;
  navLibrary: string;
  navRadios: string;
  newPlaylist: string;
  likedSongs: string;
  songsCount: string;
  songSingular: string;
  playlistLabel: string;
  yourPlaylist: string;
  curatedSelection: string;
  albumLabel: string;
  artistVerified: string;
  monthlyListeners: string;
  playAll: string;
  playList: string;
  shuffle: string;
  saveAlbum: string;
  saved: string;
  savePlaylist: string;
  inLibrary: string;
  deletePlaylist: string;
  playlistDeleted: string;
  albumSaved: string;
  albumRemoved: string;
  playlistSaved: string;
  playlistRemoved: string;
  addedToQueue: string;
  addedToPlaylist: string;
  playlistCreated: string;
  back: string;
  exploreGenres: string;
  musicGenre: string;
  playGenreRadio: string;
  artistsOf: string;
  hitsOf: string;
  popular: string;
  discography: string;
  relatedArtists: string;
  loadingAlbum: string;
  loadingPlaylist: string;
  loadingGenre: string;
  loadingArtist: string;
  noLikedTitle: string;
  noLikedSub: string;
  emptyPlaylistSub: string;
  viewAll: string;
  selectedSongs: string;
  artistRole: string;
  playSelection: string;
  catalogLoadError: string;
  searchPlaceholder: string;
  clearSearch: string;
  searchingWorld: string;
  noResultsTitle: string;
  noResultsSub: string;
  topResult: string;
  songsSection: string;
  moreResults: string;
  artistsSection: string;
  albumsSection: string;
  playlistsSection: string;
  exploreByGenre: string;
  radiosTitle: string;
  radiosSub: string;
  tuningRadios: string;
  libraryTitle: string;
  librarySub: string;
  savedAlbumsTitle: string;
  savedPlaylistsTitle: string;
  recentlyPlayed: string;
  queueTitle: string;
  queueEmpty: string;
  createPlaylistTitle: string;
  createPlaylistPlaceholder: string;
  cancel: string;
  create: string;
  addTrackPrefix: string;
  createNewPlaylistBtn: string;
  installAppTitle: string;
  installAppSub: string;
  removeFromPlaylist: string;
  addToQueue: string;
  addToPlaylist: string;
  likeAdd: string;
  likeRemove: string;
  languageTitle: string;

  // Home Sections
  secYtmHits: string;
  secYtmAlbums: string;
  secSpotifyHits: string;
  secSpotifyAlbums: string;
  secSpainHits: string;
  secMorocco: string;
  secArab: string;
  secAfrica: string;
  secRussia: string;
  secRomania: string;
  secChina: string;
  secUsa: string;
  secNewReleases: string;
  secTopArtists: string;
  secTop50: string;
  secUrbano: string;
  secPop: string;
  secChill: string;
  secRock: string;
  secFlamenco: string;
  secAudius: string;
  secLatin: string;
  secRnb: string;
  secSoundtrack: string;
  secClassics: string;
  secTopAlbums: string;
  secEditorialPlaylists: string;
  secElectronic: string;

  // Mood Pills & Quick Cards
  moodAll: string;
  moodYtm: string;
  moodSpotify: string;
  moodMorocco: string;
  moodArab: string;
  moodAfrica: string;
  moodRussia: string;
  moodRomania: string;
  moodChina: string;
  moodUsa: string;
  moodSpain: string;
  moodUrbano: string;
  moodPop: string;
  moodElectronic: string;
  moodRock: string;
  moodChill: string;
  moodFlamenco: string;
  moodLatin: string;
  moodRnb: string;
  moodSoundtrack: string;
  moodClassics: string;
  moodAudius: string;

  // Radio Region/Tag Labels
  radioAll: string;
  radioSpain: string;
  radioMorocco: string;
  radioArab: string;
  radioAfrica: string;
  radioRussia: string;
  radioRomania: string;
  radioChina: string;
  radioUsa: string;
  radioLatin: string;
  radioPop: string;
  radioElectronic: string;
  radioRock: string;
  radioLofi: string;
  radioJazz: string;

  // Player Bar & Modal
  playerRegionAria: string;
  liveRadioBadge: string;
  liveRadioCountry: string;
  loadingTrack: string;
  eqTitle: string;
  eqSubtitle: string;
  eqProfile: string;
  playbackSpeed: string;
  sleepTimer: string;
  minsRemaining: string;
  tabCover: string;
  tabLyrics: string;
  tabVideo: string;
  searchingLyrics: string;
  noLyricsTitle: string;
  noLyricsSub: string;
  videoStageOpen: string;
  videoStageSub: string;
  videoSwitchAudio: string;
  videoNotFound: string;
  playingLiveRadio: string;
  queueBtn: string;
  lyricsBtn: string;
  videoBtn: string;
  eqBtn: string;
  muteBtn: string;
  spatial8dBtn: string;
  spatial8dTitle: string;
  spatial8dSub: string;
  spatial8dOrbit: string;
  spatial8dConcert: string;
  spatial8dClub: string;
  spatial8dBadgeLive: string;

  // Pro Song Editor & MP3 Download
  studioTitle: string;
  studioSubtitle: string;
  studioTab8d: string;
  studioTabFx: string;
  studioTabEq: string;
  proVibesTitle: string;
  vibeOriginal: string;
  vibe8dUltra: string;
  vibeSlowed: string;
  vibeNightcore: string;
  vibeBass: string;
  vibeLofi: string;
  resetStudio: string;
  speedOrbitLabel: string;
  reverbDepthLabel: string;
  stereoWidthLabel: string;
  bassBoostLabel: string;
  pitchLockLabel: string;
  pitchLockSub: string;
  downloadMp3Btn: string;
  downloadMp3FxBtn: string;
  autoDownloadLabel: string;
  autoDownloadSub: string;
  downloadingToast: string;

  // 10-Band EQ, DSP, Trajectories, Custom Presets & Bitrate
  eq10Subtitle: string;
  trajectoryLabel: string;
  trajOrbit: string;
  trajPendulum: string;
  trajFigure8: string;
  trajElevated: string;
  pitchSemitonesLabel: string;
  vocalCancelLabel: string;
  vocalCancelSub: string;
  exciterLabel: string;
  vinylCrackleLabel: string;
  crossfadeLabel: string;
  normalizeLabel: string;
  trimFadeTitle: string;
  trimStartLabel: string;
  trimEndLabel: string;
  fadeLabel: string;
  customPresetsTitle: string;
  savePresetPlaceholder: string;
  savePresetBtn: string;
  perTrackProfileLabel: string;
  saveTrackProfileBtn: string;
  exportBitrateLabel: string;
  wifiOnlyLabel: string;

  // Downloads, Offline Library & Batch Exports
  downloadsTitle: string;
  downloadsEmpty: string;
  saveOfflineBtn: string;
  savedOfflineBadge: string;
  offlineLibTitle: string;
  offlineLibEmpty: string;
  removeOfflineBtn: string;
  exportZipBtn: string;
  exportZipDone: string;
  exportM3uBtn: string;
  exportJsonBtn: string;
  offlineBannerText: string;

  // Drive Mode, Source Switcher, Lyrics, For You & Stats
  driveModeBtn: string;
  driveModeExit: string;
  driveModeWakeLock: string;
  sourceSwitcherTitle: string;
  copyLyricsBtn: string;
  lyricsCopied: string;
  translateLyricsBtn: string;
  lyricsFontLabel: string;
  forYouTitle: string;
  forYouSub: string;
  statsTitle: string;
  statsPlaysLabel: string;
  statsMinutesLabel: string;
  statsTopArtistLabel: string;
  recentSearchesTitle: string;
  clearHistoryBtn: string;
  quickSearchesTitle: string;

  // Spotify & YouTube Music Importer
  importMusicBtn: string;
  importTitle: string;
  importSub: string;
  importTabLink: string;
  importTabFile: string;
  importTabTaste: string;
  importLinkPlaceholder: string;
  importLinkBtn: string;
  importLinkHelp: string;
  importPrivateWarn: string;
  importFileDrop: string;
  importFilePastePlaceholder: string;
  importParseBtn: string;
  importHowToTitle: string;
  importHowToSpotify: string;
  importHowToYtm: string;
  importTargetLikes: string;
  importTargetPlaylist: string;
  importTargetTasteOnly: string;
  importPlaylistNamePlaceholder: string;
  importSuccessToast: string;
  importMatchingLabel: string;
  tasteArtistsLabel: string;
  tasteGenresLabel: string;
  addArtistPlaceholder: string;
  generateTasteMixBtn: string;
  autoplayLabel: string;
  autoplaySub: string;
  autoplayBadge: string;
  autoplayLoadingNext: string;
  importSkipLater: string;
  importWelcomeBadge: string;
  forYouImportedTitle: string;
  forYouImportedSub: string;
  importTabConnect: string;
  connectSpotifyTitle: string;
  connectSpotifySub: string;
  connectSpotifyBtn: string;
  connectYoutubeTitle: string;
  connectYoutubeSub: string;
  connectYoutubeBtn: string;
  oauthImportingAll: string;
  oauthCommitAllBtn: string;

  // #84-#90 & Simplified Home/Library UI
  jamLabel: string;
  jamSub: string;
  autoDjLabel: string;
  autoDjSub: string;
  karaoke1Tap: string;
  seedRadioBtn: string;
  aiMoodTitle: string;
  aiMoodSub: string;
  aiMoodPlaceholder: string;
  aiMoodBtn: string;
  aiMoodGenerating: string;
  wrappedTitle: string;
  wrappedTopTrack: string;
  wrappedPlayMix: string;
  moreActionsBtn: string;
  filterAll: string;
  filterMusic: string;
  filterAiMix: string;
  filterGlobal: string;
  libAll: string;
  libPlaylists: string;
  libAlbums: string;
  libArtists: string;
  libSortRecent: string;
  libSortAlpha: string;
}

export const MUSIC_I18N: Record<MusicLang, MusicCopy> = {
  es: {
    goodMorning: 'Buenos días',
    goodAfternoon: 'Buenas tardes',
    goodEvening: 'Buenas noches',
    spatialAudioLabel: 'Audio Espacial Hi-Fi',
    playingNow: 'Sonando ahora',
    worldTrending: 'Global · YouTube Music & Spotify',
    heroFallbackSub: 'YouTube Music, Spotify Global, África, Marruecos, Árabe, Rusia, China, Rumanía, USA y +70 radios 24/7',
    playNow: 'Reproducir ahora',
    pause: 'Pausar',
    shuffleMix: 'Mix Aleatorio',
    radios247: 'Radios 24/7',
    navHome: 'Inicio',
    navExplore: 'Explorar',
    navExploreLong: 'Explorar & Mundo',
    navLibrary: 'Biblioteca',
    navRadios: 'Radios 24/7',
    newPlaylist: 'Nueva Playlist',
    likedSongs: 'Tus Me Gusta',
    songsCount: 'canciones',
    songSingular: 'canción',
    playlistLabel: 'Playlist',
    yourPlaylist: 'Tu Playlist',
    curatedSelection: 'Selección Mundial Riffan Music',
    albumLabel: 'Álbum',
    artistVerified: 'Artista verificado',
    monthlyListeners: 'oyentes mensuales',
    playAll: 'Reproducir todo',
    playList: 'Reproducir lista',
    shuffle: 'Aleatorio',
    saveAlbum: 'Guardar álbum',
    saved: 'Guardado',
    savePlaylist: 'Guardar playlist',
    inLibrary: 'En tu biblioteca',
    deletePlaylist: 'Eliminar playlist',
    playlistDeleted: 'Playlist eliminada',
    albumSaved: 'Álbum guardado',
    albumRemoved: 'Álbum eliminado de tu biblioteca',
    playlistSaved: 'Playlist guardada en Tu Biblioteca',
    playlistRemoved: 'Playlist eliminada',
    addedToQueue: 'Añadida a la cola',
    addedToPlaylist: 'Añadida a',
    playlistCreated: 'Playlist creada',
    back: 'Volver',
    exploreGenres: 'Explorar géneros',
    musicGenre: 'Género Musical',
    playGenreRadio: 'Reproducir radio de',
    artistsOf: 'Artistas de',
    hitsOf: 'Éxitos de',
    popular: 'Populares',
    discography: 'Discografía y Lanzamientos',
    relatedArtists: 'Artistas relacionados',
    loadingAlbum: 'Cargando canciones del álbum...',
    loadingPlaylist: 'Cargando lista de canciones...',
    loadingGenre: 'Cargando música del género...',
    loadingArtist: 'Cargando discografía y temas...',
    noLikedTitle: 'Aún no tienes canciones favoritas',
    noLikedSub: 'Toca el corazón en cualquier canción para guardarla aquí.',
    emptyPlaylistSub: 'Esta playlist está vacía. Usa el botón + en cualquier tema.',
    viewAll: 'Ver todo',
    selectedSongs: 'canciones seleccionadas',
    artistRole: 'Artista',
    playSelection: 'Reproducir selección',
    catalogLoadError: 'No se pudo cargar el catálogo musical. Revisa tu conexión.',
    searchPlaceholder: 'Busca canciones, YouTube Music, Spotify, álbumes o radios del mundo...',
    clearSearch: 'Limpiar búsqueda',
    searchingWorld: 'Buscando en YouTube Music, Spotify, Deezer, iTunes y radios...',
    noResultsTitle: 'No encontramos resultados para',
    noResultsSub: 'Prueba con otro artista, idioma o emisora.',
    topResult: 'Resultado principal',
    songsSection: 'Canciones',
    moreResults: 'Más resultados',
    artistsSection: 'Artistas',
    albumsSection: 'Álbumes',
    playlistsSection: 'Playlists',
    exploreByGenre: 'Explorar por géneros y regiones',
    radiosTitle: 'Radios Mundiales en Directo 24/7',
    radiosSub: 'Marruecos, Árabe, África, Rusia, Rumanía, China, USA, España y Latinoamérica en Hi-Fi',
    tuningRadios: 'Sintonizando emisoras en directo...',
    libraryTitle: 'Tu Biblioteca',
    librarySub: 'Tus canciones favoritas, playlists y álbumes guardados',
    savedAlbumsTitle: 'Álbumes guardados',
    savedPlaylistsTitle: 'Playlists guardadas',
    recentlyPlayed: 'Escuchado recientemente',
    queueTitle: 'Cola de reproducción',
    queueEmpty: 'La cola está vacía.',
    createPlaylistTitle: 'Nueva Playlist',
    createPlaylistPlaceholder: 'Ej: Gimnasio, Coche, Marruecos, Chill...',
    cancel: 'Cancelar',
    create: 'Crear',
    addTrackPrefix: 'Añadir',
    createNewPlaylistBtn: 'Crear nueva playlist',
    installAppTitle: 'Instalar Riffan App',
    installAppSub: 'Android APK · iPhone · Chrome',
    removeFromPlaylist: 'Quitar de la playlist',
    addToQueue: 'Añadir a la cola',
    addToPlaylist: 'Añadir a playlist',
    likeAdd: 'Añadir a Tus Me Gusta',
    likeRemove: 'Quitar de Tus Me Gusta',
    languageTitle: 'Idioma',

    secYtmHits: 'YouTube Music · Lo Último & Tendencias',
    secYtmAlbums: 'Álbumes Tendencia · YouTube Music',
    secSpotifyHits: 'Spotify Global & Viral Sync',
    secSpotifyAlbums: 'Álbumes Destacados · Spotify & iTunes',
    secSpainHits: 'Éxitos en España y Virales',
    secMorocco: 'Marruecos · Rap, Raï & Chaabi',
    secArab: 'Mundo Árabe · Éxitos Top',
    secAfrica: 'África Entera · Afrobeats, Amapiano & Rumba',
    secRussia: 'Rusia · Éxitos & Urban',
    secRomania: 'Rumanía & Balcanes · Pop & Dance',
    secChina: 'China · C-Pop & Mandopop',
    secUsa: 'Estados Unidos · Billboard Hot',
    secNewReleases: 'Novedades & Lanzamientos',
    secTopArtists: 'Artistas del Momento',
    secTop50: 'Top 50 Mundial',
    secUrbano: 'Urbano & Reggaeton',
    secPop: 'Pop Internacional & Hits',
    secChill: 'Chill, Lo-Fi & Estudio',
    secRock: 'Rock, Indie & Guitarra',
    secFlamenco: 'Flamenco, Acústico & Raíz',
    secAudius: 'Independiente Hi-Fi (Audius)',
    secLatin: 'Latina · Reggaeton, Salsa & Corridos',
    secRnb: 'R&B, Soul & Groove',
    secSoundtrack: 'Bandas Sonoras & Cine',
    secClassics: 'Clásicos Eternos 80s · 90s',
    secTopAlbums: 'Álbumes Destacados',
    secEditorialPlaylists: 'Playlists Editoriales',
    secElectronic: 'Electrónica & Club Sessions',

    moodAll: 'Todo el Mundo',
    moodYtm: 'YouTube Music',
    moodSpotify: 'Spotify Sync',
    moodMorocco: 'Marruecos',
    moodArab: 'Árabe',
    moodAfrica: 'África',
    moodRussia: 'Rusia',
    moodRomania: 'Rumanía',
    moodChina: 'China',
    moodUsa: 'USA',
    moodSpain: 'Top España',
    moodUrbano: 'Urbano',
    moodPop: 'Pop',
    moodElectronic: 'Electrónica',
    moodRock: 'Rock & Indie',
    moodChill: 'Chill & Lo-Fi',
    moodFlamenco: 'Flamenco',
    moodLatin: 'Latina',
    moodRnb: 'R&B & Soul',
    moodSoundtrack: 'Cine & OST',
    moodClassics: 'Clásicos',
    moodAudius: 'Audius Hi-Fi',

    radioAll: 'Todo el Mundo',
    radioSpain: 'España',
    radioMorocco: 'Marruecos',
    radioArab: 'Mundo Árabe',
    radioAfrica: 'África',
    radioRussia: 'Rusia',
    radioRomania: 'Rumanía',
    radioChina: 'China',
    radioUsa: 'USA',
    radioLatin: 'Latina',
    radioPop: 'Pop & Hits',
    radioElectronic: 'Electrónica',
    radioRock: 'Rock',
    radioLofi: 'Lo-Fi',
    radioJazz: 'Jazz & Soul',

    playerRegionAria: 'Reproductor Riffan Music',
    liveRadioBadge: 'EN VIVO · 24/7',
    liveRadioCountry: 'Radio en Directo',
    loadingTrack: 'Cargando...',
    eqTitle: 'Ecualizador & Motor Hi-Fi',
    eqSubtitle: 'WebAudio 5 bandas en tiempo real',
    eqProfile: 'Perfil Acústico',
    playbackSpeed: 'Velocidad de reproducción',
    sleepTimer: 'Temporizador de sueño',
    minsRemaining: 'min restantes',
    tabCover: 'Carátula',
    tabLyrics: 'Letra',
    tabVideo: 'Vídeo',
    searchingLyrics: 'Buscando letra sincronizada...',
    noLyricsTitle: 'Sin letra disponible',
    noLyricsSub: 'Esta pista es instrumental o no tiene letra indexada.',
    videoStageOpen: 'Modo Vídeo Musical activo',
    videoStageSub: 'Reproduciendo el vídeo oficial en el escenario superior de Riffan Music.',
    videoSwitchAudio: 'Volver a carátula',
    videoNotFound: 'No hay vídeo disponible para esta pista.',
    playingLiveRadio: 'Sintonizando Radio en Directo',
    queueBtn: 'Cola',
    lyricsBtn: 'Letra',
    videoBtn: 'Vídeo',
    eqBtn: 'EQ',
    muteBtn: 'Silenciar',
    spatial8dBtn: 'Audio 8D',
    spatial8dTitle: 'Audio Espacial 8D Binaural',
    spatial8dSub: 'Órbita HRTF 360° + Reverb de Sala (usa auriculares para máximo 8D)',
    spatial8dOrbit: 'Órbita 360°',
    spatial8dConcert: 'Sala Concierto',
    spatial8dClub: 'Club 360°',
    spatial8dBadgeLive: '8D ACTIVO',

    studioTitle: 'Editor Pro de Canción & Estudio 8D',
    studioSubtitle: 'DSP en vivo, FX vinilo, 8D real y exportación MP3 320k',
    studioTab8d: '8D Espacial',
    studioTabFx: 'Editor FX',
    studioTabEq: 'EQ & Timer',
    proVibesTitle: 'Estilos Studio 1-Tap',
    vibeOriginal: 'Original',
    vibe8dUltra: '8D Ultra',
    vibeSlowed: 'Slowed + Reverb',
    vibeNightcore: 'Nightcore',
    vibeBass: 'Bass Extreme',
    vibeLofi: 'Lo-Fi Cálido',
    resetStudio: 'Resetear',
    speedOrbitLabel: 'Velocidad Órbita 8D',
    reverbDepthLabel: 'Profundidad Reverb',
    stereoWidthLabel: 'Amplitud Estéreo 8D',
    bassBoostLabel: 'Refuerzo Sub-Bass',
    pitchLockLabel: 'Bloqueo de Tono (Pitch)',
    pitchLockSub: 'Desactívalo para efecto vinilo real en Slowed / Nightcore',
    downloadMp3Btn: 'Descargar MP3',
    downloadMp3FxBtn: 'MP3 con FX / 8D',
    autoDownloadLabel: 'Auto-descargar MP3',
    autoDownloadSub: 'Guarda automáticamente cada canción en MP3 al sonar',
    downloadingToast: 'Preparando descarga MP3 320kbps...',

    eq10Subtitle: 'Ecualizador Gráfico 10 Bandas + Espectro en vivo',
    trajectoryLabel: 'Trayectoria Espacial 8D',
    trajOrbit: 'Órbita 360°',
    trajPendulum: 'Péndulo',
    trajFigure8: 'Ocho ∞',
    trajElevated: 'Elevado 3D',
    pitchSemitonesLabel: 'Tono (Semitonos)',
    vocalCancelLabel: 'Modo Karaoke (Vocal Cancel)',
    vocalCancelSub: 'Reduce la voz central en tiempo real y al exportar',
    exciterLabel: 'Excitador Armónico (Brillo Hi-Fi)',
    vinylCrackleLabel: 'Textura Vinilo Lo-Fi',
    crossfadeLabel: 'Crossfade entre canciones',
    normalizeLabel: 'Normalizar Volumen (LUFS)',
    trimFadeTitle: 'Recorte & Fade In/Out (MP3 / Reproducción)',
    trimStartLabel: 'Inicio',
    trimEndLabel: 'Fin',
    fadeLabel: 'Fade',
    customPresetsTitle: 'Tus Ajustes Guardados',
    savePresetPlaceholder: 'Nombre del preset...',
    savePresetBtn: 'Guardar',
    perTrackProfileLabel: 'Recordar DSP por canción',
    saveTrackProfileBtn: 'Guardar perfil en esta canción',
    exportBitrateLabel: 'Calidad MP3 Exportación',
    wifiOnlyLabel: 'Auto-descarga solo con Wi-Fi',

    downloadsTitle: 'Descargas & Biblioteca Offline',
    downloadsEmpty: 'No hay descargas recientes en la cola.',
    saveOfflineBtn: 'Guardar Offline',
    savedOfflineBadge: 'Guardada Offline',
    offlineLibTitle: 'Canciones Guardadas Offline',
    offlineLibEmpty: 'Guarda canciones o playlists para escucharlas sin conexión.',
    removeOfflineBtn: 'Quitar Offline',
    exportZipBtn: 'Descargar ZIP MP3',
    exportZipDone: 'ZIP MP3 generado correctamente',
    exportM3uBtn: 'Exportar M3U8',
    exportJsonBtn: 'Exportar JSON',
    offlineBannerText: 'Sin conexión · Reproduciendo desde caché offline',

    driveModeBtn: 'Modo Coche',
    driveModeExit: 'Salir Modo Coche',
    driveModeWakeLock: 'Pantalla activa',
    sourceSwitcherTitle: 'Cambiar Fuente de Audio',
    copyLyricsBtn: 'Copiar letra',
    lyricsCopied: 'Letra copiada',
    translateLyricsBtn: 'Buscar traducción',
    lyricsFontLabel: 'Tamaño letra',
    forYouTitle: 'Para Ti · Mix Infinito',
    forYouSub: 'Generado con tus gustos importados, favoritos e historial',
    statsTitle: 'Tu Resumen Musical',
    statsPlaysLabel: 'Reproducciones',
    statsMinutesLabel: 'Minutos escuchados',
    statsTopArtistLabel: 'Artista top',
    recentSearchesTitle: 'Búsquedas recientes',
    clearHistoryBtn: 'Limpiar',
    quickSearchesTitle: 'Sugerencias rápidas',

    importMusicBtn: 'Importar Spotify / YT Music',
    importTitle: 'Importar Gustos, Favoritos y Playlists',
    importSub: 'Trae tu música de Spotify y YouTube Music por enlace o exportación oficial',
    importTabLink: 'Pegar Enlace',
    importTabFile: 'Subir Archivo / Texto',
    importTabTaste: 'Tus Gustos',
    importLinkPlaceholder: 'Pega URL pública de playlist, álbum o canción de Spotify / YT Music...',
    importLinkBtn: 'Analizar Enlace',
    importLinkHelp: 'Compatible con enlaces de open.spotify.com y music.youtube.com/playlist?list=...',
    importPrivateWarn: 'Los "Me Gusta" privados de YouTube Music (LM/LL) no son públicos por URL; usa Google Takeout en la pestaña Subir Archivo.',
    importFileDrop: 'Sube YourLibrary.json, StreamingHistory.json, watch-history.json, CSV o M3U8',
    importFilePastePlaceholder: 'O pega aquí tu lista en formato "Artista - Canción" (una por línea)...',
    importParseBtn: 'Procesar Lista y Buscar Carátulas',
    importHowToTitle: '¿Cómo exportar todos tus Me Gusta e historial?',
    importHowToSpotify: 'Spotify: Cuenta → Privacidad → Solicitar datos (YourLibrary.json / StreamingHistory_music_0.json) o Exportify CSV.',
    importHowToYtm: 'YouTube Music: takeout.google.com → selecciona YouTube y YouTube Music (watch-history.json o CSV de playlists).',
    importTargetLikes: 'Guardar en Tus Me Gusta',
    importTargetPlaylist: 'Crear Playlist Nueva',
    importTargetTasteOnly: 'Solo fusionar en Tus Gustos (Para Ti)',
    importPlaylistNamePlaceholder: 'Nombre de la playlist importada...',
    importSuccessToast: 'Importación completada',
    importMatchingLabel: 'Buscando carátulas y audio HD...',
    tasteArtistsLabel: 'Tus Artistas Favoritos',
    tasteGenresLabel: 'Tus Géneros / Regiones',
    addArtistPlaceholder: 'Añadir artista o género...',
    generateTasteMixBtn: 'Reproducir Mix Para Ti',
    autoplayLabel: 'Autoplay por género similar',
    autoplaySub: 'Al terminar, reproduce automáticamente canciones del mismo estilo',
    autoplayBadge: 'Radio Autoplay',
    autoplayLoadingNext: 'Buscando temas similares...',
    importSkipLater: 'Ahora no, ir a escuchar',
    importWelcomeBadge: 'Personaliza tu Riffan Music',
    forYouImportedTitle: 'Para Ti · Según tus gustos',
    forYouImportedSub: 'Generado automáticamente con tus artistas y géneros importados',
    importTabConnect: 'Conectar Cuenta',
    connectSpotifyTitle: 'Spotify · Login oficial',
    connectSpotifySub: 'Importa tus Me Gusta, Top Artistas, Géneros y todas tus Playlists privadas o públicas',
    connectSpotifyBtn: 'Conectar con Spotify',
    connectYoutubeTitle: 'YouTube / YouTube Music · Google',
    connectYoutubeSub: 'Lee tus playlists, vídeos musicales con Me Gusta y canales suscritos con un clic',
    connectYoutubeBtn: 'Conectar con Google · YouTube Music',
    oauthImportingAll: 'Conectando y extrayendo tus playlists, Me Gusta, artistas y géneros...',
    oauthCommitAllBtn: 'Importar todo a Riffan Music',

    jamLabel: 'Riffan Jam',
    jamSub: 'Sincroniza cola y reproducción con tu sala',
    autoDjLabel: 'Auto-DJ',
    autoDjSub: 'Mezcla automática sin pausas (4.5s+)',
    karaoke1Tap: 'Karaoke',
    seedRadioBtn: 'Radio desde este tema',
    aiMoodTitle: 'Mix IA al instante',
    aiMoodSub: 'Describe tu momento y crea una playlist completa al segundo',
    aiMoodPlaceholder: 'Ej: entrenar de noche, conducir lluvia, chill estudio...',
    aiMoodBtn: 'Crear Mix',
    aiMoodGenerating: 'Mezclando...',
    wrappedTitle: 'Tu Riffan Wrapped',
    wrappedTopTrack: 'Tema más escuchado',
    wrappedPlayMix: 'Reproducir Top Mix',
    moreActionsBtn: 'Más opciones',
    filterAll: 'Todo',
    filterMusic: 'Música',
    filterAiMix: 'Mix IA',
    filterGlobal: 'Global',
    libAll: 'Todo',
    libPlaylists: 'Listas',
    libAlbums: 'Álbumes',
    libArtists: 'Artistas',
    libSortRecent: 'Recientes',
    libSortAlpha: 'A–Z',
  },

  en: {
    goodMorning: 'Good morning',
    goodAfternoon: 'Good afternoon',
    goodEvening: 'Good evening',
    spatialAudioLabel: 'Hi-Fi Spatial Audio',
    playingNow: 'Now Playing',
    worldTrending: 'Global · YouTube Music & Spotify',
    heroFallbackSub: 'YouTube Music, Spotify Global, Africa, Morocco, Arabic, Russia, China, Romania, USA & 70+ live radios',
    playNow: 'Play now',
    pause: 'Pause',
    shuffleMix: 'Shuffle Mix',
    radios247: '24/7 Radios',
    navHome: 'Home',
    navExplore: 'Explore',
    navExploreLong: 'Explore & World',
    navLibrary: 'Library',
    navRadios: '24/7 Radios',
    newPlaylist: 'New Playlist',
    likedSongs: 'Liked Songs',
    songsCount: 'songs',
    songSingular: 'song',
    playlistLabel: 'Playlist',
    yourPlaylist: 'Your Playlist',
    curatedSelection: 'Riffan Music Global Selection',
    albumLabel: 'Album',
    artistVerified: 'Verified Artist',
    monthlyListeners: 'monthly listeners',
    playAll: 'Play all',
    playList: 'Play list',
    shuffle: 'Shuffle',
    saveAlbum: 'Save album',
    saved: 'Saved',
    savePlaylist: 'Save playlist',
    inLibrary: 'In your library',
    deletePlaylist: 'Delete playlist',
    playlistDeleted: 'Playlist deleted',
    albumSaved: 'Album saved',
    albumRemoved: 'Album removed from library',
    playlistSaved: 'Playlist saved to Library',
    playlistRemoved: 'Playlist removed',
    addedToQueue: 'Added to queue',
    addedToPlaylist: 'Added to',
    playlistCreated: 'Playlist created',
    back: 'Back',
    exploreGenres: 'Explore genres',
    musicGenre: 'Music Genre',
    playGenreRadio: 'Play radio for',
    artistsOf: 'Artists in',
    hitsOf: 'Top hits in',
    popular: 'Popular',
    discography: 'Discography & Releases',
    relatedArtists: 'Related Artists',
    loadingAlbum: 'Loading album tracks...',
    loadingPlaylist: 'Loading playlist tracks...',
    loadingGenre: 'Loading genre catalog...',
    loadingArtist: 'Loading discography...',
    noLikedTitle: 'No favorite songs yet',
    noLikedSub: 'Tap the heart on any track to save it here.',
    emptyPlaylistSub: 'This playlist is empty. Tap + on any track to add songs.',
    viewAll: 'View all',
    selectedSongs: 'selected tracks',
    artistRole: 'Artist',
    playSelection: 'Play selection',
    catalogLoadError: 'Could not load music catalog. Check your connection.',
    searchPlaceholder: 'Search tracks, YouTube Music, Spotify, albums or world radios...',
    clearSearch: 'Clear search',
    searchingWorld: 'Searching YouTube Music, Spotify, Deezer, iTunes & world radios...',
    noResultsTitle: 'No results found for',
    noResultsSub: 'Try another artist, language or radio station.',
    topResult: 'Top Result',
    songsSection: 'Songs',
    moreResults: 'More results',
    artistsSection: 'Artists',
    albumsSection: 'Albums',
    playlistsSection: 'Playlists',
    exploreByGenre: 'Browse by genre and region',
    radiosTitle: 'World Live Radios 24/7',
    radiosSub: 'Morocco, Arab World, Africa, Russia, Romania, China, USA, Spain & Latin America in Hi-Fi',
    tuningRadios: 'Tuning live stations...',
    libraryTitle: 'Your Library',
    librarySub: 'Your liked songs, playlists and saved albums',
    savedAlbumsTitle: 'Saved Albums',
    savedPlaylistsTitle: 'Saved Playlists',
    recentlyPlayed: 'Recently Played',
    queueTitle: 'Up Next',
    queueEmpty: 'Your queue is empty.',
    createPlaylistTitle: 'New Playlist',
    createPlaylistPlaceholder: 'e.g. Gym, Drive, Morocco, Chill...',
    cancel: 'Cancel',
    create: 'Create',
    addTrackPrefix: 'Add',
    createNewPlaylistBtn: 'Create new playlist',
    installAppTitle: 'Install Riffan App',
    installAppSub: 'Android APK · iPhone · Chrome',
    removeFromPlaylist: 'Remove from playlist',
    addToQueue: 'Add to queue',
    addToPlaylist: 'Add to playlist',
    likeAdd: 'Add to Liked Songs',
    likeRemove: 'Remove from Liked Songs',
    languageTitle: 'Language',

    secYtmHits: 'YouTube Music · Latest & Trending',
    secYtmAlbums: 'Trending Albums · YouTube Music',
    secSpotifyHits: 'Spotify Global & Viral Sync',
    secSpotifyAlbums: 'Featured Albums · Spotify & iTunes',
    secSpainHits: 'Spain Top & Viral',
    secMorocco: 'Morocco · Rap, Raï & Chaabi',
    secArab: 'Arab World · Top Hits',
    secAfrica: 'All Africa · Afrobeats, Amapiano & Rumba',
    secRussia: 'Russia · Hits & Urban',
    secRomania: 'Romania & Balkans · Pop & Dance',
    secChina: 'China · C-Pop & Mandopop',
    secUsa: 'United States · Billboard Hot',
    secNewReleases: 'New Releases',
    secTopArtists: 'Trending Artists',
    secTop50: 'Global Top 50',
    secUrbano: 'Urban & Reggaeton',
    secPop: 'International Pop Hits',
    secChill: 'Chill, Lo-Fi & Focus',
    secRock: 'Rock, Indie & Guitar',
    secFlamenco: 'Flamenco & Acoustic',
    secAudius: 'Audius Hi-Fi Independent',
    secLatin: 'Latin · Reggaeton, Salsa & Corridos',
    secRnb: 'R&B, Soul & Groove',
    secSoundtrack: 'Film & Soundtracks',
    secClassics: 'Timeless Classics 80s · 90s',
    secTopAlbums: 'Featured Albums',
    secEditorialPlaylists: 'Editorial Playlists',
    secElectronic: 'Electronic & Club Sessions',

    moodAll: 'Worldwide',
    moodYtm: 'YouTube Music',
    moodSpotify: 'Spotify Sync',
    moodMorocco: 'Morocco',
    moodArab: 'Arabic',
    moodAfrica: 'Africa',
    moodRussia: 'Russia',
    moodRomania: 'Romania',
    moodChina: 'China',
    moodUsa: 'USA',
    moodSpain: 'Spain Top',
    moodUrbano: 'Urban',
    moodPop: 'Pop',
    moodElectronic: 'Electronic',
    moodRock: 'Rock & Indie',
    moodChill: 'Chill & Lo-Fi',
    moodFlamenco: 'Flamenco',
    moodLatin: 'Latin',
    moodRnb: 'R&B & Soul',
    moodSoundtrack: 'Film & OST',
    moodClassics: 'Classics',
    moodAudius: 'Audius Hi-Fi',

    radioAll: 'Worldwide',
    radioSpain: 'Spain',
    radioMorocco: 'Morocco',
    radioArab: 'Arab World',
    radioAfrica: 'Africa',
    radioRussia: 'Russia',
    radioRomania: 'Romania',
    radioChina: 'China',
    radioUsa: 'USA',
    radioLatin: 'Latin',
    radioPop: 'Pop & Hits',
    radioElectronic: 'Electronic',
    radioRock: 'Rock',
    radioLofi: 'Lo-Fi',
    radioJazz: 'Jazz & Soul',

    playerRegionAria: 'Riffan Music Player',
    liveRadioBadge: 'LIVE · 24/7',
    liveRadioCountry: 'Live Radio',
    loadingTrack: 'Loading...',
    eqTitle: 'Equalizer & Hi-Fi Engine',
    eqSubtitle: 'Real-time 5-band WebAudio',
    eqProfile: 'Acoustic Profile',
    playbackSpeed: 'Playback Speed',
    sleepTimer: 'Sleep Timer',
    minsRemaining: 'min left',
    tabCover: 'Artwork',
    tabLyrics: 'Lyrics',
    tabVideo: 'Video',
    searchingLyrics: 'Searching synced lyrics...',
    noLyricsTitle: 'No lyrics available',
    noLyricsSub: 'This track is instrumental or not indexed yet.',
    videoStageOpen: 'Music Video Mode active',
    videoStageSub: 'Playing official music video in the Riffan Music video stage.',
    videoSwitchAudio: 'Back to artwork',
    videoNotFound: 'No music video available for this track.',
    playingLiveRadio: 'Streaming Live Radio',
    queueBtn: 'Queue',
    lyricsBtn: 'Lyrics',
    videoBtn: 'Video',
    eqBtn: 'EQ',
    muteBtn: 'Mute',
    spatial8dBtn: '8D Audio',
    spatial8dTitle: '8D Binaural Spatial Audio',
    spatial8dSub: '360° HRTF orbit + studio hall reverb (headphones recommended)',
    spatial8dOrbit: '360° Orbit',
    spatial8dConcert: 'Concert Hall',
    spatial8dClub: 'Club 360°',
    spatial8dBadgeLive: '8D ACTIVE',

    studioTitle: 'Pro Song Editor & 8D Studio',
    studioSubtitle: 'Live DSP, vinyl pitch FX, real 8D & 320k MP3 export',
    studioTab8d: '8D Spatial',
    studioTabFx: 'FX Editor',
    studioTabEq: 'EQ & Timer',
    proVibesTitle: '1-Tap Studio Vibes',
    vibeOriginal: 'Original',
    vibe8dUltra: '8D Ultra',
    vibeSlowed: 'Slowed + Reverb',
    vibeNightcore: 'Nightcore',
    vibeBass: 'Bass Extreme',
    vibeLofi: 'Lo-Fi Warmth',
    resetStudio: 'Reset',
    speedOrbitLabel: '8D Orbit Speed',
    reverbDepthLabel: 'Hall Reverb Depth',
    stereoWidthLabel: '8D Stereo Width',
    bassBoostLabel: 'Sub-Bass Boost',
    pitchLockLabel: 'Pitch Lock',
    pitchLockSub: 'Turn off for true vinyl Slowed & Nightcore pitch shift',
    downloadMp3Btn: 'Download MP3',
    downloadMp3FxBtn: 'MP3 with FX / 8D',
    autoDownloadLabel: 'Auto-Download MP3',
    autoDownloadSub: 'Automatically save each song as MP3 when played',
    downloadingToast: 'Preparing 320kbps MP3 download...',

    eq10Subtitle: '10-Band Graphic Equalizer + Live Spectrum',
    trajectoryLabel: '8D Spatial Trajectory',
    trajOrbit: '360° Orbit',
    trajPendulum: 'Pendulum',
    trajFigure8: 'Figure-8 ∞',
    trajElevated: 'Elevated 3D',
    pitchSemitonesLabel: 'Pitch Shift (Semitones)',
    vocalCancelLabel: 'Karaoke Mode (Vocal Cancel)',
    vocalCancelSub: 'Reduces center lead vocals in real time & MP3 export',
    exciterLabel: 'Aural Exciter (Hi-Fi Sheen)',
    vinylCrackleLabel: 'Lo-Fi Vinyl Warmth',
    crossfadeLabel: 'Track Crossfade',
    normalizeLabel: 'Loudness Normalize (LUFS)',
    trimFadeTitle: 'Trim & Fade In/Out (Playback / MP3)',
    trimStartLabel: 'Start',
    trimEndLabel: 'End',
    fadeLabel: 'Fade',
    customPresetsTitle: 'Your Saved Presets',
    savePresetPlaceholder: 'Preset name...',
    savePresetBtn: 'Save',
    perTrackProfileLabel: 'Remember DSP per track',
    saveTrackProfileBtn: 'Save profile to this song',
    exportBitrateLabel: 'MP3 Export Bitrate',
    wifiOnlyLabel: 'Auto-download on Wi-Fi only',

    downloadsTitle: 'Downloads & Offline Library',
    downloadsEmpty: 'No recent downloads in queue.',
    saveOfflineBtn: 'Save Offline',
    savedOfflineBadge: 'Saved Offline',
    offlineLibTitle: 'Offline Saved Tracks',
    offlineLibEmpty: 'Save tracks or playlists for offline listening.',
    removeOfflineBtn: 'Remove Offline',
    exportZipBtn: 'Download ZIP MP3',
    exportZipDone: 'MP3 ZIP archive ready',
    exportM3uBtn: 'Export M3U8',
    exportJsonBtn: 'Export JSON',
    offlineBannerText: 'Offline · Playing from local cache',

    driveModeBtn: 'Drive Mode',
    driveModeExit: 'Exit Drive Mode',
    driveModeWakeLock: 'Screen awake',
    sourceSwitcherTitle: 'Switch Audio Source',
    copyLyricsBtn: 'Copy lyrics',
    lyricsCopied: 'Lyrics copied',
    translateLyricsBtn: 'Translate lyrics',
    lyricsFontLabel: 'Lyrics size',
    forYouTitle: 'For You · Infinite Mix',
    forYouSub: 'Built from your imported taste, liked tracks and listening history',
    statsTitle: 'Your Music Recap',
    statsPlaysLabel: 'Plays',
    statsMinutesLabel: 'Minutes listened',
    statsTopArtistLabel: 'Top artist',
    recentSearchesTitle: 'Recent searches',
    clearHistoryBtn: 'Clear',
    quickSearchesTitle: 'Quick picks',

    importMusicBtn: 'Import Spotify / YT Music',
    importTitle: 'Import Tastes, Likes & Playlists',
    importSub: 'Bring your music from Spotify & YouTube Music via link or data export',
    importTabLink: 'Paste Link',
    importTabFile: 'Upload File / Text',
    importTabTaste: 'Your Taste',
    importLinkPlaceholder: 'Paste public Spotify / YT Music playlist, album or track URL...',
    importLinkBtn: 'Analyze Link',
    importLinkHelp: 'Supports open.spotify.com and music.youtube.com/playlist?list=...',
    importPrivateWarn: 'Private YouTube Music Liked tracks (LM/LL) require Google Takeout in Upload File tab.',
    importFileDrop: 'Upload YourLibrary.json, StreamingHistory.json, watch-history.json, CSV or M3U8',
    importFilePastePlaceholder: 'Or paste songs in "Artist - Title" format (one per line)...',
    importParseBtn: 'Parse & Match Cover Art',
    importHowToTitle: 'How to export all likes & history',
    importHowToSpotify: 'Spotify: Account → Privacy → Request Data (YourLibrary.json / StreamingHistory_music_0.json) or Exportify CSV.',
    importHowToYtm: 'YouTube Music: takeout.google.com → select YouTube and YouTube Music (watch-history.json or playlist CSV).',
    importTargetLikes: 'Save to Liked Songs',
    importTargetPlaylist: 'Create New Playlist',
    importTargetTasteOnly: 'Merge into Taste Profile only',
    importPlaylistNamePlaceholder: 'Imported playlist name...',
    importSuccessToast: 'Import complete',
    importMatchingLabel: 'Matching artwork & HD streams...',
    tasteArtistsLabel: 'Your Favorite Artists',
    tasteGenresLabel: 'Your Genres / Regions',
    addArtistPlaceholder: 'Add artist or genre...',
    generateTasteMixBtn: 'Play For You Mix',
    autoplayLabel: 'Similar genre autoplay',
    autoplaySub: 'Automatically queues related tracks matching the initial song style',
    autoplayBadge: 'Autoplay Radio',
    autoplayLoadingNext: 'Finding similar tracks...',
    importSkipLater: 'Skip for now',
    importWelcomeBadge: 'Personalize Riffan Music',
    forYouImportedTitle: 'For You · Based on your taste',
    forYouImportedSub: 'Tailored automatically from your imported artists & genres',
    importTabConnect: 'Connect Account',
    connectSpotifyTitle: 'Spotify · Official Login',
    connectSpotifySub: 'Import Liked Songs, Top Artists, Genres and all your private & public playlists',
    connectSpotifyBtn: 'Connect with Spotify',
    connectYoutubeTitle: 'YouTube / YouTube Music · Google',
    connectYoutubeSub: 'Read your playlists, liked music videos and subscribed channels in one click',
    connectYoutubeBtn: 'Sign in with Google · YouTube Music',
    oauthImportingAll: 'Connecting and importing your playlists, likes, artists & genres...',
    oauthCommitAllBtn: 'Import everything to Riffan Music',

    jamLabel: 'Riffan Jam',
    jamSub: 'Sync queue & playback with your room',
    autoDjLabel: 'Auto-DJ',
    autoDjSub: 'Seamless beatmatch crossfade (4.5s+)',
    karaoke1Tap: 'Karaoke',
    seedRadioBtn: 'Radio from this track',
    aiMoodTitle: 'Instant AI Mood Mix',
    aiMoodSub: 'Describe your vibe and generate a full playable playlist',
    aiMoodPlaceholder: 'e.g. late night drive, gym focus, rainy chill...',
    aiMoodBtn: 'Build Mix',
    aiMoodGenerating: 'Mixing...',
    wrappedTitle: 'Your Riffan Wrapped',
    wrappedTopTrack: 'Most played track',
    wrappedPlayMix: 'Play Top Mix',
    moreActionsBtn: 'More options',
    filterAll: 'All',
    filterMusic: 'Music',
    filterAiMix: 'AI Mix',
    filterGlobal: 'Global',
    libAll: 'All',
    libPlaylists: 'Playlists',
    libAlbums: 'Albums',
    libArtists: 'Artists',
    libSortRecent: 'Recents',
    libSortAlpha: 'A–Z',
  },

  fr: {
    goodMorning: 'Bonjour',
    goodAfternoon: 'Bon après-midi',
    goodEvening: 'Bonsoir',
    spatialAudioLabel: 'Audio Spatial Hi-Fi',
    playingNow: 'En lecture',
    worldTrending: 'Monde · YouTube Music & Spotify',
    heroFallbackSub: 'YouTube Music, Spotify Global, Afrique, Maroc, Arabe, Russie, Chine, Roumanie, USA & +70 radios',
    playNow: 'Lire maintenant',
    pause: 'Pause',
    shuffleMix: 'Mix Aléatoire',
    radios247: 'Radios 24/7',
    navHome: 'Accueil',
    navExplore: 'Explorer',
    navExploreLong: 'Explorer & Monde',
    navLibrary: 'Bibliothèque',
    navRadios: 'Radios 24/7',
    newPlaylist: 'Nouvelle Playlist',
    likedSongs: 'Titres Likés',
    songsCount: 'titres',
    songSingular: 'titre',
    playlistLabel: 'Playlist',
    yourPlaylist: 'Votre Playlist',
    curatedSelection: 'Sélection Mondiale Riffan Music',
    albumLabel: 'Album',
    artistVerified: 'Artiste vérifié',
    monthlyListeners: 'auditeurs mensuels',
    playAll: 'Tout lire',
    playList: 'Lire la liste',
    shuffle: 'Aléatoire',
    saveAlbum: 'Enregistrer l’album',
    saved: 'Enregistré',
    savePlaylist: 'Enregistrer',
    inLibrary: 'Dans votre bibliothèque',
    deletePlaylist: 'Supprimer la playlist',
    playlistDeleted: 'Playlist supprimée',
    albumSaved: 'Album enregistré',
    albumRemoved: 'Album retiré de votre bibliothèque',
    playlistSaved: 'Playlist enregistrée',
    playlistRemoved: 'Playlist supprimée',
    addedToQueue: 'Ajouté à la file',
    addedToPlaylist: 'Ajouté à',
    playlistCreated: 'Playlist créée',
    back: 'Retour',
    exploreGenres: 'Explorer les genres',
    musicGenre: 'Genre Musical',
    playGenreRadio: 'Lancer la radio',
    artistsOf: 'Artistes de',
    hitsOf: 'Succès de',
    popular: 'Populaires',
    discography: 'Discographie & Sorties',
    relatedArtists: 'Artistes similaires',
    loadingAlbum: 'Chargement de l’album...',
    loadingPlaylist: 'Chargement de la playlist...',
    loadingGenre: 'Chargement du genre...',
    loadingArtist: 'Chargement de la discographie...',
    noLikedTitle: 'Aucun titre favori pour le moment',
    noLikedSub: 'Touchez le cœur sur n’importe quel titre pour le sauvegarder.',
    emptyPlaylistSub: 'Cette playlist est vide. Utilisez + pour ajouter des morceaux.',
    viewAll: 'Tout voir',
    selectedSongs: 'titres sélectionnés',
    artistRole: 'Artiste',
    playSelection: 'Lire la sélection',
    catalogLoadError: 'Impossible de charger le catalogue musical.',
    searchPlaceholder: 'Rechercher titres, YouTube Music, Spotify, albums ou radios...',
    clearSearch: 'Effacer',
    searchingWorld: 'Recherche sur YouTube Music, Spotify, Deezer, iTunes & radios...',
    noResultsTitle: 'Aucun résultat pour',
    noResultsSub: 'Essayez un autre artiste, langue ou station.',
    topResult: 'Meilleur résultat',
    songsSection: 'Titres',
    moreResults: 'Plus de résultats',
    artistsSection: 'Artistes',
    albumsSection: 'Albums',
    playlistsSection: 'Playlists',
    exploreByGenre: 'Parcourir par genres et régions',
    radiosTitle: 'Radios Mondiales en Direct 24/7',
    radiosSub: 'Maroc, Monde Arabe, Afrique, Russie, Roumanie, Chine, USA, Espagne & Amérique Latine',
    tuningRadios: 'Connexion aux stations en direct...',
    libraryTitle: 'Votre Bibliothèque',
    librarySub: 'Vos favoris, playlists et albums enregistrés',
    savedAlbumsTitle: 'Albums enregistrés',
    savedPlaylistsTitle: 'Playlists enregistrées',
    recentlyPlayed: 'Écoutés récemment',
    queueTitle: 'File d’attente',
    queueEmpty: 'La file d’attente est vide.',
    createPlaylistTitle: 'Nouvelle Playlist',
    createPlaylistPlaceholder: 'Ex : Sport, Maroc, Route, Chill...',
    cancel: 'Annuler',
    create: 'Créer',
    addTrackPrefix: 'Ajouter',
    createNewPlaylistBtn: 'Créer une playlist',
    installAppTitle: 'Installer Riffan App',
    installAppSub: 'APK Android · iPhone · Chrome',
    removeFromPlaylist: 'Retirer de la playlist',
    addToQueue: 'Ajouter à la file',
    addToPlaylist: 'Ajouter à une playlist',
    likeAdd: 'Ajouter aux favoris',
    likeRemove: 'Retirer des favoris',
    languageTitle: 'Langue',

    secYtmHits: 'YouTube Music · Nouveautés & Tendances',
    secYtmAlbums: 'Albums Tendance · YouTube Music',
    secSpotifyHits: 'Spotify Global & Viral Sync',
    secSpotifyAlbums: 'Albums Vedettes · Spotify & iTunes',
    secSpainHits: 'Top Espagne & Viral',
    secMorocco: 'Maroc · Rap, Raï & Chaabi',
    secArab: 'Monde Arabe · Top Hits',
    secAfrica: 'Toute l’Afrique · Afrobeats, Amapiano & Rumba',
    secRussia: 'Russie · Hits & Urbain',
    secRomania: 'Roumanie & Balkans · Pop & Dance',
    secChina: 'Chine · C-Pop & Mandopop',
    secUsa: 'États-Unis · Billboard Hot',
    secNewReleases: 'Nouveautés & Sorties',
    secTopArtists: 'Artistes du Moment',
    secTop50: 'Top 50 Mondial',
    secUrbano: 'Urbain & Reggaeton',
    secPop: 'Pop Internationale',
    secChill: 'Chill, Lo-Fi & Étude',
    secRock: 'Rock, Indie & Guitare',
    secFlamenco: 'Flamenco & Acoustique',
    secAudius: 'Indépendant Hi-Fi (Audius)',
    secLatin: 'Latino · Reggaeton, Salsa & Corridos',
    secRnb: 'R&B, Soul & Groove',
    secSoundtrack: 'Bandes Originales & Cinéma',
    secClassics: 'Classiques Éternels 80s · 90s',
    secTopAlbums: 'Albums Populaires',
    secEditorialPlaylists: 'Playlists Éditoriales',
    secElectronic: 'Électro & Club Sessions',

    moodAll: 'Monde entier',
    moodYtm: 'YouTube Music',
    moodSpotify: 'Spotify Sync',
    moodMorocco: 'Maroc',
    moodArab: 'Arabe',
    moodAfrica: 'Afrique',
    moodRussia: 'Russie',
    moodRomania: 'Roumanie',
    moodChina: 'Chine',
    moodUsa: 'USA',
    moodSpain: 'Top Espagne',
    moodUrbano: 'Urbain',
    moodPop: 'Pop',
    moodElectronic: 'Électro',
    moodRock: 'Rock & Indie',
    moodChill: 'Chill & Lo-Fi',
    moodFlamenco: 'Flamenco',
    moodLatin: 'Latino',
    moodRnb: 'R&B & Soul',
    moodSoundtrack: 'Cinéma & OST',
    moodClassics: 'Classiques',
    moodAudius: 'Audius Hi-Fi',

    radioAll: 'Monde',
    radioSpain: 'Espagne',
    radioMorocco: 'Maroc',
    radioArab: 'Monde Arabe',
    radioAfrica: 'Afrique',
    radioRussia: 'Russie',
    radioRomania: 'Roumanie',
    radioChina: 'Chine',
    radioUsa: 'USA',
    radioLatin: 'Latino',
    radioPop: 'Pop & Hits',
    radioElectronic: 'Électro',
    radioRock: 'Rock',
    radioLofi: 'Lo-Fi',
    radioJazz: 'Jazz & Soul',

    playerRegionAria: 'Lecteur Riffan Music',
    liveRadioBadge: 'EN DIRECT · 24/7',
    liveRadioCountry: 'Radio en Direct',
    loadingTrack: 'Chargement...',
    eqTitle: 'Égaliseur & Moteur Hi-Fi',
    eqSubtitle: 'WebAudio 5 bandes en temps réel',
    eqProfile: 'Profil Acoustique',
    playbackSpeed: 'Vitesse de lecture',
    sleepTimer: 'Minuteur de veille',
    minsRemaining: 'min restantes',
    tabCover: 'Pochette',
    tabLyrics: 'Paroles',
    tabVideo: 'Vidéo',
    searchingLyrics: 'Recherche des paroles synchronisées...',
    noLyricsTitle: 'Paroles indisponibles',
    noLyricsSub: 'Ce morceau est instrumental ou non indexé.',
    videoStageOpen: 'Mode Vidéo Musical actif',
    videoStageSub: 'Lecture du clip officiel sur la scène Riffan Music.',
    videoSwitchAudio: 'Retour à la pochette',
    videoNotFound: 'Aucune vidéo disponible pour ce titre.',
    playingLiveRadio: 'Diffusion Radio en Direct',
    queueBtn: 'File',
    lyricsBtn: 'Paroles',
    videoBtn: 'Vidéo',
    eqBtn: 'EQ',
    muteBtn: 'Muet',
    spatial8dBtn: 'Audio 8D',
    spatial8dTitle: 'Audio Spatial 8D Binaural',
    spatial8dSub: 'Orbite HRTF 360° + réverbération studio (casque recommandé)',
    spatial8dOrbit: 'Orbite 360°',
    spatial8dConcert: 'Salle Concert',
    spatial8dClub: 'Club 360°',
    spatial8dBadgeLive: '8D ACTIF',

    studioTitle: 'Éditeur Pro & Studio 8D',
    studioSubtitle: 'DSP en direct, FX vinyle, 8D réel & export MP3 320k',
    studioTab8d: '8D Spatial',
    studioTabFx: 'Éditeur FX',
    studioTabEq: 'EQ & Minuteur',
    proVibesTitle: 'Styles Studio 1-Clic',
    vibeOriginal: 'Original',
    vibe8dUltra: '8D Ultra',
    vibeSlowed: 'Slowed + Reverb',
    vibeNightcore: 'Nightcore',
    vibeBass: 'Bass Extreme',
    vibeLofi: 'Lo-Fi Doux',
    resetStudio: 'Réinitialiser',
    speedOrbitLabel: 'Vitesse Orbite 8D',
    reverbDepthLabel: 'Profondeur Reverb',
    stereoWidthLabel: 'Largeur Stéréo 8D',
    bassBoostLabel: 'Boost Sub-Bass',
    pitchLockLabel: 'Verrouillage Tonalité',
    pitchLockSub: 'Désactivez pour un vrai effet vinyle Slowed / Nightcore',
    downloadMp3Btn: 'Télécharger MP3',
    downloadMp3FxBtn: 'MP3 avec FX / 8D',
    autoDownloadLabel: 'Téléchargement MP3 Auto',
    autoDownloadSub: 'Enregistre chaque titre en MP3 automatiquement',
    downloadingToast: 'Préparation du MP3 320kbps...',

    eq10Subtitle: 'Égaliseur Graphique 10 Bandes + Spectre en direct',
    trajectoryLabel: 'Trajectoire Spatiale 8D',
    trajOrbit: 'Orbite 360°',
    trajPendulum: 'Pendule',
    trajFigure8: 'Huit ∞',
    trajElevated: 'Élevé 3D',
    pitchSemitonesLabel: 'Tonalité (Demi-tons)',
    vocalCancelLabel: 'Mode Karaoké (Vocal Cancel)',
    vocalCancelSub: 'Réduit la voix principale en direct et à l’export',
    exciterLabel: 'Exciteur Harmonique',
    vinylCrackleLabel: 'Texture Vinyle Lo-Fi',
    crossfadeLabel: 'Fondu enchaîné (Crossfade)',
    normalizeLabel: 'Normaliser le volume (LUFS)',
    trimFadeTitle: 'Découpe & Fondu (Lecture / MP3)',
    trimStartLabel: 'Début',
    trimEndLabel: 'Fin',
    fadeLabel: 'Fondu',
    customPresetsTitle: 'Vos Préréglages',
    savePresetPlaceholder: 'Nom du préréglage...',
    savePresetBtn: 'Enregistrer',
    perTrackProfileLabel: 'Mémoriser DSP par titre',
    saveTrackProfileBtn: 'Enregistrer sur ce titre',
    exportBitrateLabel: 'Qualité MP3 Export',
    wifiOnlyLabel: 'Auto-téléchargement Wi-Fi uniquement',

    downloadsTitle: 'Téléchargements & Hors-ligne',
    downloadsEmpty: 'Aucun téléchargement récent.',
    saveOfflineBtn: 'Sauver Hors-ligne',
    savedOfflineBadge: 'Hors-ligne',
    offlineLibTitle: 'Titres Hors-ligne',
    offlineLibEmpty: 'Enregistrez des titres pour écouter sans connexion.',
    removeOfflineBtn: 'Retirer Hors-ligne',
    exportZipBtn: 'Télécharger ZIP MP3',
    exportZipDone: 'Archive ZIP MP3 prête',
    exportM3uBtn: 'Exporter M3U8',
    exportJsonBtn: 'Exporter JSON',
    offlineBannerText: 'Hors-ligne · Lecture depuis le cache local',

    driveModeBtn: 'Mode Voiture',
    driveModeExit: 'Quitter Mode Voiture',
    driveModeWakeLock: 'Écran actif',
    sourceSwitcherTitle: 'Changer de Source Audio',
    copyLyricsBtn: 'Copier paroles',
    lyricsCopied: 'Paroles copiées',
    translateLyricsBtn: 'Traduire',
    lyricsFontLabel: 'Taille paroles',
    forYouTitle: 'Pour Vous · Mix Infini',
    forYouSub: 'Basé sur vos goûts importés, favoris et écoutes récentes',
    statsTitle: 'Votre Bilan Musical',
    statsPlaysLabel: 'Écoutes',
    statsMinutesLabel: 'Minutes écoutées',
    statsTopArtistLabel: 'Artiste top',
    recentSearchesTitle: 'Recherches récentes',
    clearHistoryBtn: 'Effacer',
    quickSearchesTitle: 'Suggestions',

    importMusicBtn: 'Importer Spotify / YT Music',
    importTitle: 'Importer Goûts, Favoris & Playlists',
    importSub: 'Importez depuis Spotify et YouTube Music par lien ou export officiel',
    importTabLink: 'Coller un Lien',
    importTabFile: 'Fichier / Texte',
    importTabTaste: 'Vos Goûts',
    importLinkPlaceholder: 'Collez un lien public Spotify ou YT Music...',
    importLinkBtn: 'Analyser',
    importLinkHelp: 'Compatible avec open.spotify.com et music.youtube.com/playlist?list=...',
    importPrivateWarn: 'Les titres likés privés YT Music (LM/LL) nécessitent Google Takeout.',
    importFileDrop: 'Importez YourLibrary.json, StreamingHistory.json, watch-history.json, CSV ou M3U8',
    importFilePastePlaceholder: 'Ou collez vos titres au format "Artiste - Titre"...',
    importParseBtn: 'Analyser & Chercher Pochettes',
    importHowToTitle: 'Comment exporter vos favoris et historique',
    importHowToSpotify: 'Spotify : Compte → Confidentialité → Télécharger les données ou Exportify CSV.',
    importHowToYtm: 'YouTube Music : takeout.google.com → YouTube & YouTube Music (watch-history.json).',
    importTargetLikes: 'Ajouter aux Titres Likés',
    importTargetPlaylist: 'Créer une Playlist',
    importTargetTasteOnly: 'Fusionner dans Vos Goûts uniquement',
    importPlaylistNamePlaceholder: 'Nom de la playlist importée...',
    importSuccessToast: 'Importation réussie',
    importMatchingLabel: 'Recherche des pochettes HD...',
    tasteArtistsLabel: 'Vos Artistes Favoris',
    tasteGenresLabel: 'Vos Genres / Régions',
    addArtistPlaceholder: 'Ajouter artiste ou genre...',
    generateTasteMixBtn: 'Lancer Mix Pour Vous',
    autoplayLabel: 'Lecture auto par genre similaire',
    autoplaySub: 'Enchaîne automatiquement des titres du même style musical',
    autoplayBadge: 'Radio Autoplay',
    autoplayLoadingNext: 'Recherche de titres similaires...',
    importSkipLater: 'Plus tard',
    importWelcomeBadge: 'Personnalisez Riffan Music',
    forYouImportedTitle: 'Pour Vous · Selon vos goûts',
    forYouImportedSub: 'Généré automatiquement avec vos artistes et genres importés',
    importTabConnect: 'Connecter',
    connectSpotifyTitle: 'Spotify · Connexion officielle',
    connectSpotifySub: 'Importez vos Titres likés, Top Artistes, Genres et toutes vos Playlists',
    connectSpotifyBtn: 'Se connecter avec Spotify',
    connectYoutubeTitle: 'YouTube / YouTube Music · Google',
    connectYoutubeSub: 'Importe vos playlists, titres aimés et chaînes musicales en un clic',
    connectYoutubeBtn: 'Se connecter avec Google · YouTube Music',
    oauthImportingAll: 'Connexion et extraction de vos playlists, goûts, artistes et genres...',
    oauthCommitAllBtn: 'Tout importer dans Riffan Music',

    jamLabel: 'Riffan Jam',
    jamSub: 'Synchroniser la file et la lecture avec la salle',
    autoDjLabel: 'Auto-DJ',
    autoDjSub: 'Enchaînement fluide sans coupure (4.5s+)',
    karaoke1Tap: 'Karaoké',
    seedRadioBtn: 'Radio depuis ce titre',
    aiMoodTitle: 'Mix IA instantané',
    aiMoodSub: 'Décrivez votre ambiance pour créer une playlist complète',
    aiMoodPlaceholder: 'Ex : route de nuit, sport intensif, chill pluie...',
    aiMoodBtn: 'Créer le Mix',
    aiMoodGenerating: 'Mixage...',
    wrappedTitle: 'Votre Riffan Wrapped',
    wrappedTopTrack: 'Titre le plus écouté',
    wrappedPlayMix: 'Lire Top Mix',
    moreActionsBtn: 'Plus d’options',
    filterAll: 'Tout',
    filterMusic: 'Musique',
    filterAiMix: 'Mix IA',
    filterGlobal: 'Monde',
    libAll: 'Tout',
    libPlaylists: 'Playlists',
    libAlbums: 'Albums',
    libArtists: 'Artistes',
    libSortRecent: 'Récents',
    libSortAlpha: 'A–Z',
  },

  zh: {
    goodMorning: '早上好',
    goodAfternoon: '下午好',
    goodEvening: '晚上好',
    spatialAudioLabel: '高保真空间音频',
    playingNow: '正在播放',
    worldTrending: '全球 · YouTube Music & Spotify',
    heroFallbackSub: '同步 YouTube Music、Spotify 全球榜、非洲、摩洛哥、阿拉伯、俄罗斯、中国、罗马尼亚、美国及 70+ 直播电台',
    playNow: '立即播放',
    pause: '暂停',
    shuffleMix: '随机混音',
    radios247: '24/7 电台',
    navHome: '首页',
    navExplore: '探索',
    navExploreLong: '探索全球',
    navLibrary: '音乐库',
    navRadios: '全球电台',
    newPlaylist: '新建歌单',
    likedSongs: '我喜欢的音乐',
    songsCount: '首歌曲',
    songSingular: '首歌曲',
    playlistLabel: '歌单',
    yourPlaylist: '我的歌单',
    curatedSelection: 'Riffan Music 全球精选',
    albumLabel: '专辑',
    artistVerified: '认证艺人',
    monthlyListeners: '月听众',
    playAll: '全部播放',
    playList: '播放列表',
    shuffle: '随机播放',
    saveAlbum: '收藏专辑',
    saved: '已收藏',
    savePlaylist: '收藏歌单',
    inLibrary: '已在音乐库',
    deletePlaylist: '删除歌单',
    playlistDeleted: '歌单已删除',
    albumSaved: '专辑已收藏',
    albumRemoved: '已从音乐库移除专辑',
    playlistSaved: '歌单已保存',
    playlistRemoved: '歌单已移除',
    addedToQueue: '已加入播放队列',
    addedToPlaylist: '已添加到',
    playlistCreated: '歌单已创建',
    back: '返回',
    exploreGenres: '探索流派',
    musicGenre: '音乐流派',
    playGenreRadio: '播放电台',
    artistsOf: '代表艺人',
    hitsOf: '热门单曲',
    popular: '热门歌曲',
    discography: '专辑与新作',
    relatedArtists: '相似艺人',
    loadingAlbum: '正在加载专辑曲目...',
    loadingPlaylist: '正在加载歌单...',
    loadingGenre: '正在加载流派音乐...',
    loadingArtist: '正在加载艺人作品...',
    noLikedTitle: '暂无喜欢的歌曲',
    noLikedSub: '点击任意歌曲上的红心即可收藏。',
    emptyPlaylistSub: '歌单为空，点击歌曲旁的 + 添加曲目。',
    viewAll: '查看全部',
    selectedSongs: '首精选歌曲',
    artistRole: '艺人',
    playSelection: '播放精选',
    catalogLoadError: '无法加载音乐目录，请检查网络。',
    searchPlaceholder: '搜索歌曲、YouTube Music、Spotify、专辑或全球电台...',
    clearSearch: '清除搜索',
    searchingWorld: '正在搜索 YouTube Music、Spotify、Deezer、iTunes 与电台...',
    noResultsTitle: '未找到相关结果',
    noResultsSub: '请尝试其他歌手、语言或电台。',
    topResult: '最佳匹配',
    songsSection: '歌曲',
    moreResults: '更多结果',
    artistsSection: '艺人',
    albumsSection: '专辑',
    playlistsSection: '歌单',
    exploreByGenre: '按流派与地区探索',
    radiosTitle: '全球 24/7 直播音乐电台',
    radiosSub: '摩洛哥、阿拉伯、非洲、俄罗斯、罗马尼亚、中国、美国、西班牙及拉美 Hi-Fi 直播',
    tuningRadios: '正在调频直播电台...',
    libraryTitle: '我的音乐库',
    librarySub: '收藏的歌曲、个人歌单与专辑',
    savedAlbumsTitle: '已收藏专辑',
    savedPlaylistsTitle: '已收藏歌单',
    recentlyPlayed: '最近播放',
    queueTitle: '播放队列',
    queueEmpty: '播放队列为空。',
    createPlaylistTitle: '新建歌单',
    createPlaylistPlaceholder: '例如：健身、驾车、华语、Chill...',
    cancel: '取消',
    create: '创建',
    addTrackPrefix: '添加',
    createNewPlaylistBtn: '创建新歌单',
    installAppTitle: '安装 Riffan 应用',
    installAppSub: 'Android APK · iPhone · Chrome',
    removeFromPlaylist: '从歌单移除',
    addToQueue: '加入播放队列',
    addToPlaylist: '添加到歌单',
    likeAdd: '喜欢',
    likeRemove: '取消喜欢',
    languageTitle: '语言',

    secYtmHits: 'YouTube Music · 最新热门与MV',
    secYtmAlbums: '热门专辑 · YouTube Music',
    secSpotifyHits: 'Spotify 全球热榜 & 飙升榜',
    secSpotifyAlbums: '精选专辑 · Spotify & iTunes',
    secSpainHits: '西班牙热门与飙升榜',
    secMorocco: '摩洛哥 · Rap, Raï & Chaabi',
    secArab: '阿拉伯世界 · 金曲热榜',
    secAfrica: '全非音乐 · Afrobeats & Amapiano',
    secRussia: '俄罗斯 · 流行与说唱热榜',
    secRomania: '罗马尼亚与巴尔干 · 舞曲流行',
    secChina: '华语乐坛 · C-Pop & 流行金曲',
    secUsa: '美国 Billboard 热门单曲',
    secNewReleases: '新歌速递',
    secTopArtists: '当红艺人',
    secTop50: '全球 Top 50',
    secUrbano: '都市说唱 & 雷鬼顿',
    secPop: '全球流行金曲',
    secChill: '轻音乐 · Lo-Fi & 专注',
    secRock: '摇滚与独立音乐',
    secFlamenco: '弗拉明戈与原声吉他',
    secAudius: 'Audius Hi-Fi 独立音乐',
    secLatin: '拉丁音乐 · 萨尔萨与热带节奏',
    secRnb: 'R&B 与灵魂乐',
    secSoundtrack: '电影原声带',
    secClassics: '经典怀旧 80s · 90s',
    secTopAlbums: '热门专辑',
    secEditorialPlaylists: '编辑精选歌单',
    secElectronic: '电子音乐与派对混音',

    moodAll: '全球全曲库',
    moodYtm: 'YouTube Music',
    moodSpotify: 'Spotify 同步',
    moodMorocco: '摩洛哥',
    moodArab: '阿拉伯',
    moodAfrica: '非洲全境',
    moodRussia: '俄罗斯',
    moodRomania: '罗马尼亚',
    moodChina: '华语中国',
    moodUsa: '美国',
    moodSpain: '西班牙',
    moodUrbano: '说唱都市',
    moodPop: '流行',
    moodElectronic: '电子',
    moodRock: '摇滚独立',
    moodChill: 'Lo-Fi 放松',
    moodFlamenco: '弗拉明戈',
    moodLatin: '拉丁',
    moodRnb: 'R&B 灵魂',
    moodSoundtrack: '影视原声',
    moodClassics: '经典',
    moodAudius: 'Audius Hi-Fi',

    radioAll: '全球',
    radioSpain: '西班牙',
    radioMorocco: '摩洛哥',
    radioArab: '阿拉伯',
    radioAfrica: '非洲',
    radioRussia: '俄罗斯',
    radioRomania: '罗马尼亚',
    radioChina: '中国',
    radioUsa: '美国',
    radioLatin: '拉丁美洲',
    radioPop: '流行',
    radioElectronic: '电子',
    radioRock: '摇滚',
    radioLofi: 'Lo-Fi',
    radioJazz: '爵士灵魂',

    playerRegionAria: 'Riffan 音乐播放器',
    liveRadioBadge: '直播 · 24/7',
    liveRadioCountry: '直播电台',
    loadingTrack: '加载中...',
    eqTitle: '均衡器 & Hi-Fi 引擎',
    eqSubtitle: '实时 5 段 WebAudio 调音',
    eqProfile: '音效预设',
    playbackSpeed: '播放倍速',
    sleepTimer: '定时关闭',
    minsRemaining: '分钟后关闭',
    tabCover: '封面',
    tabLyrics: '歌词',
    tabVideo: '视频',
    searchingLyrics: '正在搜索同步歌词...',
    noLyricsTitle: '暂无歌词',
    noLyricsSub: '该曲目为纯音乐或暂无歌词索引。',
    videoStageOpen: 'MV 视频模式已开启',
    videoStageSub: '正在 Riffan Music 顶部舞台播放官方音乐视频。',
    videoSwitchAudio: '返回封面',
    videoNotFound: '该歌曲暂无可用音乐视频。',
    playingLiveRadio: '正在收听直播电台',
    queueBtn: '队列',
    lyricsBtn: '歌词',
    videoBtn: '视频',
    eqBtn: '均衡器',
    muteBtn: '静音',
    spatial8dBtn: '8D 环绕',
    spatial8dTitle: '8D 双耳空间音频',
    spatial8dSub: '360° HRTF 声场环绕 + 音乐厅混响（佩戴耳机效果最佳）',
    spatial8dOrbit: '360° 环绕',
    spatial8dConcert: '音乐厅',
    spatial8dClub: '360° 派对',
    spatial8dBadgeLive: '8D 开启',

    studioTitle: '专业歌曲编辑器 & 8D 工作室',
    studioSubtitle: '实时 DSP 调音、黑胶变速、真 8D 环绕与 320k MP3 下载',
    studioTab8d: '8D 空间',
    studioTabFx: '专业特效',
    studioTabEq: '均衡与定时',
    proVibesTitle: '一键录音室风格',
    vibeOriginal: '原声',
    vibe8dUltra: '8D 至臻',
    vibeSlowed: '慢放混响',
    vibeNightcore: '夜核加速',
    vibeBass: '重低音轰炸',
    vibeLofi: 'Lo-Fi 复古',
    resetStudio: '重置',
    speedOrbitLabel: '8D 环绕转速',
    reverbDepthLabel: '空间混响深度',
    stereoWidthLabel: '立体声场宽度',
    bassBoostLabel: '超重低音增益',
    pitchLockLabel: '锁定音高 (Pitch Lock)',
    pitchLockSub: '关闭可体验真实的黑胶慢放变调与 Nightcore 效果',
    downloadMp3Btn: '下载 MP3',
    downloadMp3FxBtn: '下载特效 / 8D MP3',
    autoDownloadLabel: '自动下载 MP3',
    autoDownloadSub: '播放歌曲时自动保存为 320k MP3',
    downloadingToast: '正在导出 320kbps MP3...',

    eq10Subtitle: '10 段图示均衡器 + 实时频谱',
    trajectoryLabel: '8D 空间轨迹模式',
    trajOrbit: '360° 环绕',
    trajPendulum: '钟摆摆动',
    trajFigure8: '8字 ∞ 轨迹',
    trajElevated: '3D 立体穹顶',
    pitchSemitonesLabel: '音调升降 (半音)',
    vocalCancelLabel: '卡拉OK消人声',
    vocalCancelSub: '实时及导出时削弱中央人声',
    exciterLabel: '高频谐波激励器',
    vinylCrackleLabel: '黑胶复古底噪',
    crossfadeLabel: '曲目交叉淡入淡出',
    normalizeLabel: '音量响度均衡 (LUFS)',
    trimFadeTitle: '音频裁剪与淡入淡出 (播放 / MP3)',
    trimStartLabel: '起点',
    trimEndLabel: '终点',
    fadeLabel: '淡入出',
    customPresetsTitle: '已保存预设',
    savePresetPlaceholder: '预设名称...',
    savePresetBtn: '保存',
    perTrackProfileLabel: '按歌曲记忆音效',
    saveTrackProfileBtn: '保存到当前歌曲',
    exportBitrateLabel: 'MP3 导出音质',
    wifiOnlyLabel: '仅 Wi-Fi 自动下载',

    downloadsTitle: '下载管理 & 离线曲库',
    downloadsEmpty: '暂无下载任务。',
    saveOfflineBtn: '离线缓存',
    savedOfflineBadge: '已离线保存',
    offlineLibTitle: '已离线缓存歌曲',
    offlineLibEmpty: '保存歌曲或歌单即可无网络收听。',
    removeOfflineBtn: '移除缓存',
    exportZipBtn: '打包下载 MP3 ZIP',
    exportZipDone: 'MP3 ZIP 压缩包已生成',
    exportM3uBtn: '导出 M3U8',
    exportJsonBtn: '导出 JSON',
    offlineBannerText: '离线模式 · 正在播放本地缓存',

    driveModeBtn: '驾驶模式',
    driveModeExit: '退出驾驶模式',
    driveModeWakeLock: '屏幕常亮',
    sourceSwitcherTitle: '切换音频源',
    copyLyricsBtn: '复制歌词',
    lyricsCopied: '已复制歌词',
    translateLyricsBtn: '翻译歌词',
    lyricsFontLabel: '歌词字号',
    forYouTitle: '为你推荐 · 无限混音',
    forYouSub: '基于你的导入品味、红心歌曲和收听记录生成',
    statsTitle: '音乐收听统计',
    statsPlaysLabel: '播放次数',
    statsMinutesLabel: '收听分钟',
    statsTopArtistLabel: '最爱艺人',
    recentSearchesTitle: '最近搜索',
    clearHistoryBtn: '清除',
    quickSearchesTitle: '热门建议',

    importMusicBtn: '导入 Spotify / YT Music',
    importTitle: '导入品味、红心与歌单',
    importSub: '通过链接或官方导出文件迁移 Spotify 与 YouTube Music 曲库',
    importTabLink: '粘贴链接',
    importTabFile: '上传文件 / 文本',
    importTabTaste: '音乐品味',
    importLinkPlaceholder: '粘贴 Spotify 或 YouTube Music 公开歌单/专辑链接...',
    importLinkBtn: '解析链接',
    importLinkHelp: '支持 open.spotify.com 与 music.youtube.com/playlist?list=...',
    importPrivateWarn: 'YouTube Music 私人红心 (LM/LL) 需使用 Google Takeout 导出文件上传。',
    importFileDrop: '上传 YourLibrary.json、StreamingHistory.json、watch-history.json、CSV 或 M3U8',
    importFilePastePlaceholder: '或按“歌手 - 歌名”每行一首粘贴...',
    importParseBtn: '解析并匹配高清封面',
    importHowToTitle: '如何导出红心歌曲与历史记录',
    importHowToSpotify: 'Spotify：账户隐私设置下载数据，或使用 Exportify 导出 CSV。',
    importHowToYtm: 'YouTube Music：takeout.google.com 选择 YouTube 和 YouTube Music (watch-history.json)。',
    importTargetLikes: '添加到我喜欢的音乐',
    importTargetPlaylist: '创建为新歌单',
    importTargetTasteOnly: '仅同步到音乐品味画像',
    importPlaylistNamePlaceholder: '新歌单名称...',
    importSuccessToast: '导入成功',
    importMatchingLabel: '正在匹配高清封面与音源...',
    tasteArtistsLabel: '喜爱艺人',
    tasteGenresLabel: '偏好流派 / 地区',
    addArtistPlaceholder: '添加歌手或流派...',
    generateTasteMixBtn: '播放为你定制混音',
    autoplayLabel: '相似流派自动连播',
    autoplaySub: '播放结束时自动衔接同风格关联歌曲',
    autoplayBadge: '流派电台连播',
    autoplayLoadingNext: '正在匹配相似歌曲...',
    importSkipLater: '暂不导入，先去听歌',
    importWelcomeBadge: '个性化你的 Riffan Music',
    forYouImportedTitle: '为你推荐 · 基于你的品味',
    forYouImportedSub: '根据导入的歌手和流派自动生成',
    importTabConnect: '账号登录',
    connectSpotifyTitle: 'Spotify · 官方登录',
    connectSpotifySub: '一键导入喜欢的歌曲、常听歌手、流派以及所有公开/私密歌单',
    connectSpotifyBtn: '使用 Spotify 登录导入',
    connectYoutubeTitle: 'YouTube / YouTube Music · Google',
    connectYoutubeSub: '一键读取你的播放列表、喜欢的音乐视频和订阅歌手',
    connectYoutubeBtn: '使用 Google 登录 · YouTube Music',
    oauthImportingAll: '正在连接并提取你的歌单、喜欢、歌手与流派...',
    oauthCommitAllBtn: '全部导入 Riffan Music',

    jamLabel: 'Riffan Jam',
    jamSub: '与房间好友同步播放与队列',
    autoDjLabel: 'Auto-DJ',
    autoDjSub: '无缝交叉混音过渡 (4.5s+)',
    karaoke1Tap: '卡拉OK',
    seedRadioBtn: '从此歌曲开启电台',
    aiMoodTitle: 'AI 氛围歌单',
    aiMoodSub: '输入心情或场景，立即生成完整可播歌单',
    aiMoodPlaceholder: '例如：深夜开车、健身冲刺、雨天学习...',
    aiMoodBtn: '生成混音',
    aiMoodGenerating: '生成中...',
    wrappedTitle: '我的 Riffan 年度回顾',
    wrappedTopTrack: '最常播放单曲',
    wrappedPlayMix: '播放我的 Top 混音',
    moreActionsBtn: '更多选项',
    filterAll: '全部',
    filterMusic: '音乐',
    filterAiMix: 'AI 混音',
    filterGlobal: '全球',
    libAll: '全部',
    libPlaylists: '歌单',
    libAlbums: '专辑',
    libArtists: '艺人',
    libSortRecent: '最近播放',
    libSortAlpha: 'A–Z',
  },

  ca: {
    goodMorning: 'Bon dia',
    goodAfternoon: 'Bona tarda',
    goodEvening: 'Bona nit',
    spatialAudioLabel: 'Àudio Espacial Hi-Fi',
    playingNow: 'Sonant ara',
    worldTrending: 'Global · YouTube Music & Spotify',
    heroFallbackSub: 'YouTube Music, Spotify Global, Àfrica, Marroc, Àrab, Rússia, Xina, Romania, EUA i +70 ràdios 24/7',
    playNow: 'Reproduir ara',
    pause: 'Pausar',
    shuffleMix: 'Mix Aleatori',
    radios247: 'Ràdios 24/7',
    navHome: 'Inici',
    navExplore: 'Explorar',
    navExploreLong: 'Explorar & Món',
    navLibrary: 'Biblioteca',
    navRadios: 'Ràdios 24/7',
    newPlaylist: 'Nova Playlist',
    likedSongs: 'Els teus M’agrada',
    songsCount: 'cançons',
    songSingular: 'cançó',
    playlistLabel: 'Playlist',
    yourPlaylist: 'La teva Playlist',
    curatedSelection: 'Selecció Mundial Riffan Music',
    albumLabel: 'Àlbum',
    artistVerified: 'Artista verificat',
    monthlyListeners: 'oients mensuals',
    playAll: 'Reproduir-ho tot',
    playList: 'Reproduir llista',
    shuffle: 'Aleatori',
    saveAlbum: 'Desar àlbum',
    saved: 'Desat',
    savePlaylist: 'Desar playlist',
    inLibrary: 'A la biblioteca',
    deletePlaylist: 'Eliminar playlist',
    playlistDeleted: 'Playlist eliminada',
    albumSaved: 'Àlbum desat',
    albumRemoved: 'Àlbum tret de la biblioteca',
    playlistSaved: 'Playlist desada a la biblioteca',
    playlistRemoved: 'Playlist eliminada',
    addedToQueue: 'Afegida a la cua',
    addedToPlaylist: 'Afegida a',
    playlistCreated: 'Playlist creada',
    back: 'Tornar',
    exploreGenres: 'Explorar gèneres',
    musicGenre: 'Gènere Musical',
    playGenreRadio: 'Reproduir ràdio de',
    artistsOf: 'Artistes de',
    hitsOf: 'Èxits de',
    popular: 'Populars',
    discography: 'Discografia i Llançaments',
    relatedArtists: 'Artistes relacionats',
    loadingAlbum: 'Carregant cançons de l’àlbum...',
    loadingPlaylist: 'Carregant llista de cançons...',
    loadingGenre: 'Carregant música del gènere...',
    loadingArtist: 'Carregant discografia...',
    noLikedTitle: 'Encara no tens cançons preferides',
    noLikedSub: 'Toca el cor a qualsevol cançó per desar-la aquí.',
    emptyPlaylistSub: 'Aquesta playlist és buida. Usa + per afegir temes.',
    viewAll: 'Veure-ho tot',
    selectedSongs: 'cançons seleccionades',
    artistRole: 'Artista',
    playSelection: 'Reproduir selecció',
    catalogLoadError: 'No s’ha pogut carregar el catàleg musical.',
    searchPlaceholder: 'Cerca cançons, YouTube Music, Spotify, àlbums o ràdios...',
    clearSearch: 'Netejar cerca',
    searchingWorld: 'Cercant a YouTube Music, Spotify, Deezer, iTunes i ràdios...',
    noResultsTitle: 'Sense resultats per a',
    noResultsSub: 'Prova amb un altre artista, idioma o emissora.',
    topResult: 'Resultat principal',
    songsSection: 'Cançons',
    moreResults: 'Més resultats',
    artistsSection: 'Artistes',
    albumsSection: 'Àlbums',
    playlistsSection: 'Playlists',
    exploreByGenre: 'Explorar per gèneres i regions',
    radiosTitle: 'Ràdios Mundials en Directe 24/7',
    radiosSub: 'Marroc, Món Àrab, Àfrica, Rússia, Romania, Xina, EUA, Espanya i Llatinoamèrica',
    tuningRadios: 'Sintonitzant emissores en directe...',
    libraryTitle: 'La teva Biblioteca',
    librarySub: 'Les teves preferides, playlists i àlbums desats',
    savedAlbumsTitle: 'Àlbums desats',
    savedPlaylistsTitle: 'Playlists desades',
    recentlyPlayed: 'Escoltats recentment',
    queueTitle: 'Cua de reproducció',
    queueEmpty: 'La cua és buida.',
    createPlaylistTitle: 'Nova Playlist',
    createPlaylistPlaceholder: 'Ex: Gimnàs, Cotxe, Marroc, Chill...',
    cancel: 'Cancel·lar',
    create: 'Crear',
    addTrackPrefix: 'Afegir',
    createNewPlaylistBtn: 'Crear nova playlist',
    installAppTitle: 'Instal·lar Riffan App',
    installAppSub: 'Android APK · iPhone · Chrome',
    removeFromPlaylist: 'Treure de la playlist',
    addToQueue: 'Afegir a la cua',
    addToPlaylist: 'Afegir a playlist',
    likeAdd: 'Afegir als M’agrada',
    likeRemove: 'Treure dels M’agrada',
    languageTitle: 'Idioma',

    secYtmHits: 'YouTube Music · Novetats i Tendències',
    secYtmAlbums: 'Àlbums Tendència · YouTube Music',
    secSpotifyHits: 'Spotify Global & Viral Sync',
    secSpotifyAlbums: 'Àlbums Destacats · Spotify & iTunes',
    secSpainHits: 'Èxits a Espanya i Virals',
    secMorocco: 'Marroc · Rap, Raï & Chaabi',
    secArab: 'Món Àrab · Top Èxits',
    secAfrica: 'Tota l’Àfrica · Afrobeats, Amapiano & Rumba',
    secRussia: 'Rússia · Èxits & Urbà',
    secRomania: 'Romania i Balcans · Pop & Dance',
    secChina: 'Xina · C-Pop & Mandopop',
    secUsa: 'Estats Units · Billboard Hot',
    secNewReleases: 'Novetats i Llançaments',
    secTopArtists: 'Artistes del Moment',
    secTop50: 'Top 50 Mundial',
    secUrbano: 'Urbà i Reggaeton',
    secPop: 'Pop Internacional',
    secChill: 'Chill, Lo-Fi i Estudi',
    secRock: 'Rock, Indie i Guitarra',
    secFlamenco: 'Flamenc i Acústic',
    secAudius: 'Independent Hi-Fi (Audius)',
    secLatin: 'Llatina · Reggaeton, Salsa i Corridos',
    secRnb: 'R&B, Soul i Groove',
    secSoundtrack: 'Bandes Sonores i Cinema',
    secClassics: 'Clàssics Eterms 80s · 90s',
    secTopAlbums: 'Àlbums Destacats',
    secEditorialPlaylists: 'Playlists Editorials',
    secElectronic: 'Electrònica i Club Sessions',

    moodAll: 'Tot el Món',
    moodYtm: 'YouTube Music',
    moodSpotify: 'Spotify Sync',
    moodMorocco: 'Marroc',
    moodArab: 'Àrab',
    moodAfrica: 'Àfrica',
    moodRussia: 'Rússia',
    moodRomania: 'Romania',
    moodChina: 'Xina',
    moodUsa: 'EUA',
    moodSpain: 'Top Espanya',
    moodUrbano: 'Urbà',
    moodPop: 'Pop',
    moodElectronic: 'Electrònica',
    moodRock: 'Rock & Indie',
    moodChill: 'Chill & Lo-Fi',
    moodFlamenco: 'Flamenc',
    moodLatin: 'Llatina',
    moodRnb: 'R&B & Soul',
    moodSoundtrack: 'Cinema & OST',
    moodClassics: 'Clàssics',
    moodAudius: 'Audius Hi-Fi',

    radioAll: 'Tot el Món',
    radioSpain: 'Espanya',
    radioMorocco: 'Marroc',
    radioArab: 'Món Àrab',
    radioAfrica: 'Àfrica',
    radioRussia: 'Rússia',
    radioRomania: 'Romania',
    radioChina: 'Xina',
    radioUsa: 'EUA',
    radioLatin: 'Llatina',
    radioPop: 'Pop & Hits',
    radioElectronic: 'Electrònica',
    radioRock: 'Rock',
    radioLofi: 'Lo-Fi',
    radioJazz: 'Jazz & Soul',

    playerRegionAria: 'Reproductor Riffan Music',
    liveRadioBadge: 'EN DIRECTE · 24/7',
    liveRadioCountry: 'Ràdio en Directe',
    loadingTrack: 'Carregant...',
    eqTitle: 'Equalitzador & Motor Hi-Fi',
    eqSubtitle: 'WebAudio 5 bandes en temps real',
    eqProfile: 'Perfil Acústic',
    playbackSpeed: 'Velocitat de reproducció',
    sleepTimer: 'Temporitzador de son',
    minsRemaining: 'min restants',
    tabCover: 'Caràtula',
    tabLyrics: 'Lletra',
    tabVideo: 'Vídeo',
    searchingLyrics: 'Cercant lletra sincronitzada...',
    noLyricsTitle: 'Lletra no disponible',
    noLyricsSub: 'Aquesta pista és instrumental o no té lletra indexada.',
    videoStageOpen: 'Mode Vídeo Musical actiu',
    videoStageSub: 'Reproduint el vídeo oficial a l’escenari superior de Riffan Music.',
    videoSwitchAudio: 'Tornar a la caràtula',
    videoNotFound: 'No hi ha vídeo disponible per a aquesta pista.',
    playingLiveRadio: 'Sintonitzant Ràdio en Directe',
    queueBtn: 'Cua',
    lyricsBtn: 'Lletra',
    videoBtn: 'Vídeo',
    eqBtn: 'EQ',
    muteBtn: 'Silenciar',
    spatial8dBtn: 'Àudio 8D',
    spatial8dTitle: 'Àudio Espacial 8D Binaural',
    spatial8dSub: 'Òrbita HRTF 360° + reverb d’estudi (auriculars recomanats)',
    spatial8dOrbit: 'Òrbita 360°',
    spatial8dConcert: 'Sala Concert',
    spatial8dClub: 'Club 360°',
    spatial8dBadgeLive: '8D ACTIU',

    studioTitle: 'Editor Pro de Cançó & Estudi 8D',
    studioSubtitle: 'DSP en viu, FX vinil, 8D real i exportació MP3 320k',
    studioTab8d: '8D Espacial',
    studioTabFx: 'Editor FX',
    studioTabEq: 'EQ & Timer',
    proVibesTitle: 'Estils Studio 1-Toc',
    vibeOriginal: 'Original',
    vibe8dUltra: '8D Ultra',
    vibeSlowed: 'Slowed + Reverb',
    vibeNightcore: 'Nightcore',
    vibeBass: 'Bass Extreme',
    vibeLofi: 'Lo-Fi Càlid',
    resetStudio: 'Reiniciar',
    speedOrbitLabel: 'Velocitat Òrbita 8D',
    reverbDepthLabel: 'Profunditat Reverb',
    stereoWidthLabel: 'Amplitud Estèreo 8D',
    bassBoostLabel: 'Reforç Sub-Bass',
    pitchLockLabel: 'Bloqueig de To (Pitch)',
    pitchLockSub: 'Desactiva-ho per a efecte vinil real en Slowed / Nightcore',
    downloadMp3Btn: 'Descarregar MP3',
    downloadMp3FxBtn: 'MP3 amb FX / 8D',
    autoDownloadLabel: 'Auto-descarregar MP3',
    autoDownloadSub: 'Desa automàticament cada cançó en MP3 en sonar',
    downloadingToast: 'Preparant descàrrega MP3 320kbps...',

    eq10Subtitle: 'Equalitzador Gràfic 10 Bandes + Espectre en viu',
    trajectoryLabel: 'Trajectòria Espacial 8D',
    trajOrbit: 'Òrbita 360°',
    trajPendulum: 'Pèndol',
    trajFigure8: 'Vuit ∞',
    trajElevated: 'Elevat 3D',
    pitchSemitonesLabel: 'To (Semitons)',
    vocalCancelLabel: 'Mode Karaoke (Vocal Cancel)',
    vocalCancelSub: 'Redueix la veu principal en directe i en exportar',
    exciterLabel: 'Excitador Harmònic Hi-Fi',
    vinylCrackleLabel: 'Textura Vinil Lo-Fi',
    crossfadeLabel: 'Crossfade entre pistes',
    normalizeLabel: 'Normalitzar Volum (LUFS)',
    trimFadeTitle: 'Retall & Fade In/Out (Reproducció / MP3)',
    trimStartLabel: 'Inici',
    trimEndLabel: 'Fi',
    fadeLabel: 'Fade',
    customPresetsTitle: 'Els teus Presets',
    savePresetPlaceholder: 'Nom del preset...',
    savePresetBtn: 'Desar',
    perTrackProfileLabel: 'Recordar DSP per cançó',
    saveTrackProfileBtn: 'Desar perfil en aquesta cançó',
    exportBitrateLabel: 'Qualitat MP3 Exportació',
    wifiOnlyLabel: 'Auto-descàrrega només amb Wi-Fi',

    downloadsTitle: 'Descàrregues & Biblioteca Offline',
    downloadsEmpty: 'No hi ha descàrregues recents.',
    saveOfflineBtn: 'Desar Offline',
    savedOfflineBadge: 'Desada Offline',
    offlineLibTitle: 'Cançons Desades Offline',
    offlineLibEmpty: 'Desa cançons o playlists per escoltar-les sense connexió.',
    removeOfflineBtn: 'Treure Offline',
    exportZipBtn: 'Descarregar ZIP MP3',
    exportZipDone: 'ZIP MP3 generat correctament',
    exportM3uBtn: 'Exportar M3U8',
    exportJsonBtn: 'Exportar JSON',
    offlineBannerText: 'Sense connexió · Reproduint des de memòria local',

    driveModeBtn: 'Mode Cotxe',
    driveModeExit: 'Sortir Mode Cotxe',
    driveModeWakeLock: 'Pantalla activa',
    sourceSwitcherTitle: 'Canviar Font d’Àudio',
    copyLyricsBtn: 'Copiar lletra',
    lyricsCopied: 'Lletra copiada',
    translateLyricsBtn: 'Traduir lletra',
    lyricsFontLabel: 'Mida lletra',
    forYouTitle: 'Per a Tu · Mix Infinit',
    forYouSub: 'Generat amb els teus gustos importats, favorits i historial',
    statsTitle: 'El teu Resum Musical',
    statsPlaysLabel: 'Reproduccions',
    statsMinutesLabel: 'Minuts escoltats',
    statsTopArtistLabel: 'Artista top',
    recentSearchesTitle: 'Cerques recents',
    clearHistoryBtn: 'Netejar',
    quickSearchesTitle: 'Suggeriments ràpids',

    importMusicBtn: 'Importar Spotify / YT Music',
    importTitle: 'Importar Gustos, Favorits i Playlists',
    importSub: 'Porta la teva música de Spotify i YouTube Music per enllaç o exportació oficial',
    importTabLink: 'Enganxar Enllaç',
    importTabFile: 'Pujar Arxiu / Text',
    importTabTaste: 'Els teus Gustos',
    importLinkPlaceholder: 'Enganxa URL pública de Spotify o YT Music...',
    importLinkBtn: 'Analitzar',
    importLinkHelp: 'Compatible amb open.spotify.com i music.youtube.com/playlist?list=...',
    importPrivateWarn: 'Els "M’agrada" privats de YT Music (LM/LL) requereixen Google Takeout.',
    importFileDrop: 'Puja YourLibrary.json, StreamingHistory.json, watch-history.json, CSV o M3U8',
    importFilePastePlaceholder: 'O enganxa la teva llista "Artista - Cançó" (una per línia)...',
    importParseBtn: 'Processar i Cercar Caràtules',
    importHowToTitle: 'Com exportar els teus favorits i historial',
    importHowToSpotify: 'Spotify: Compte → Privacitat → Sol·licitar dades o Exportify CSV.',
    importHowToYtm: 'YouTube Music: takeout.google.com → YouTube i YouTube Music (watch-history.json).',
    importTargetLikes: 'Desar als teus M’agrada',
    importTargetPlaylist: 'Crear Playlist Nova',
    importTargetTasteOnly: 'Només fusionar als teus Gustos',
    importPlaylistNamePlaceholder: 'Nom de la playlist importada...',
    importSuccessToast: 'Importació completada',
    importMatchingLabel: 'Cercant caràtules HD...',
    tasteArtistsLabel: 'Els teus Artistes Favorits',
    tasteGenresLabel: 'Els teus Gèneres / Regions',
    addArtistPlaceholder: 'Afegir artista o gènere...',
    generateTasteMixBtn: 'Reproduir Mix Per a Tu',
    autoplayLabel: 'Autoplay per gènere similar',
    autoplaySub: 'En acabar, reprodueix automàticament cançons del mateix estil',
    autoplayBadge: 'Ràdio Autoplay',
    autoplayLoadingNext: 'Cercant temes similars...',
    importSkipLater: 'Ara no, anar a escoltar',
    importWelcomeBadge: 'Personalitza Riffan Music',
    forYouImportedTitle: 'Per a Tu · Segons els teus gustos',
    forYouImportedSub: 'Generat automàticament amb els teus artistes i gèneres importats',
    importTabConnect: 'Connectar Compte',
    connectSpotifyTitle: 'Spotify · Login oficial',
    connectSpotifySub: 'Importa els teus M\'agrada, Top Artistes, Gèneres i totes les teves Playlists',
    connectSpotifyBtn: 'Connectar amb Spotify',
    connectYoutubeTitle: 'YouTube / YouTube Music · Google',
    connectYoutubeSub: 'Llegeix les teves playlists, vídeos musicals agradats i canals subscrits en un clic',
    connectYoutubeBtn: 'Connectar amb Google · YouTube Music',
    oauthImportingAll: 'Connectant i extraient les teves playlists, m\'agrada, artistes i gèneres...',
    oauthCommitAllBtn: 'Importar-ho tot a Riffan Music',

    jamLabel: 'Riffan Jam',
    jamSub: 'Sincronitza cua i reproducció amb la sala',
    autoDjLabel: 'Auto-DJ',
    autoDjSub: 'Mescla automàtica sense pauses (4.5s+)',
    karaoke1Tap: 'Karaoke',
    seedRadioBtn: 'Ràdio des d’aquest tema',
    aiMoodTitle: 'Mix IA a l’instant',
    aiMoodSub: 'Descriu el teu moment i crea una playlist completa al segon',
    aiMoodPlaceholder: 'Ex: conduir de nit, gimnàs, chill estudi...',
    aiMoodBtn: 'Crear Mix',
    aiMoodGenerating: 'Mesclant...',
    wrappedTitle: 'El teu Riffan Wrapped',
    wrappedTopTrack: 'Tema més escoltat',
    wrappedPlayMix: 'Reproduir Top Mix',
    moreActionsBtn: 'Més opcions',
    filterAll: 'Tot',
    filterMusic: 'Música',
    filterAiMix: 'Mix IA',
    filterGlobal: 'Global',
    libAll: 'Tot',
    libPlaylists: 'Llistes',
    libAlbums: 'Àlbums',
    libArtists: 'Artistes',
    libSortRecent: 'Recents',
    libSortAlpha: 'A–Z',
  },
};
