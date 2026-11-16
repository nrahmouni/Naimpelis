import type { AppLanguage } from '../types';

export interface LocalizedTextMap {
  es: string;
  ca: string;
  en: string;
}

/**
 * Type-safe 3-language selector ensuring Spanish (es), Catalan (ca), and English (en)
 * never silently fall back to Spanish when Catalan or English is active.
 */
export function pickLang(lang: AppLanguage, copy: LocalizedTextMap): string {
  if (lang === 'ca') return copy.ca;
  if (lang === 'en') return copy.en;
  return copy.es;
}

export interface UiCopyShape {
  appTagline: string;
  heroHeadline: string;
  heroDescription: string;
  nicknameLabel: string;
  nicknamePlaceholder: string;
  avatarLabel: string;
  accentLabel: string;
  createRoomBtn: string;
  joinRoomLabel: string;
  roomCodePlaceholder: string;
  joinBtn: string;
  recentRooms: string;
  // 5-Pillar Consolidated Navigation
  pillarExplore: string;
  pillarCatalog: string;
  pillarAnime: string;
  pillarLive: string;
  pillarMyList: string;
  // Legacy tab aliases preserved for backward compatibility
  tabMovies: string;
  tabVose: string;
  tabSeries: string;
  tabTdt: string;
  tabSports: string;
  tabYoutube: string;
  tabDirect: string;
  tabChat: string;
  tabRoom: string;
  tabMyList: string;
  searchMoviesPlaceholder: string;
  searchVoPlaceholder: string;
  searchSeriesPlaceholder: string;
  searchTdtPlaceholder: string;
  searchSportsPlaceholder: string;
  searchYoutubePlaceholder: string;
  unmuteAudio: string;
  liveNow: string;
  syncRoom: string;
  invite: string;
  smartTv: string;
  leaveRoom: string;
  chatPlaceholder: string;
  send: string;
  participants: string;
  hostLabel: string;
  modLabel: string;
  makeHost: string;
  you: string;
  copyLink: string;
  copied: string;
  extractingTitle: string;
  extractingSub: string;
  standbyTitle: string;
  standbySub: string;
  directTitle: string;
  directSub: string;
  playNativeBtn: string;
  openWebBtn: string;
  openCloudBtn: string;
  switchNativeHd: string;
  allSports: string;
  soccer: string;
  motor: string;
  basketball: string;
  tennis: string;
  notificationsTitle: string;
  surpriseMeTitle: string;
  legalTitle: string;
  // Player HUD & Modals
  qualityLabel: string;
  qualityAuto: string;
  audioTrackLabel: string;
  audioTrackEmbedded: string;
  closeModal: string;
  watchNow: string;
  addToQueue: string;
  infoLabel: string;
  trailerPreviewMute: string;
  trailerPreviewUnmute: string;
}

export const UI_COPY: Record<AppLanguage, UiCopyShape> = {
  es: {
    appTagline: 'RiffanTV · Cine, Series, TV en directo, Fútbol y YouTube sincronizado',
    heroHeadline: 'Tu sala privada para ver cine, series, TV y deporte juntos.',
    heroDescription:
      'Catálogo completo en Español, Catalán y VO 1080p, más canales de TV España en directo, fútbol en tiempo real y salas sincronizadas sin interrupciones.',
    nicknameLabel: 'Tu nombre en la sala',
    nicknamePlaceholder: 'Escribe tu nombre (ej. Naim, Carlos, Marta...)',
    avatarLabel: 'Identidad',
    accentLabel: 'Tono',
    createRoomBtn: 'Crear sala y entrar',
    joinRoomLabel: 'Unirse con código o enlace',
    roomCodePlaceholder: 'Código o link (ej. a8f2)',
    joinBtn: 'Unirse',
    recentRooms: 'Salas recientes',
    pillarExplore: 'Explorar',
    pillarCatalog: 'Series y Cine',
    pillarAnime: 'Anime',
    pillarLive: 'En Directo',
    pillarMyList: 'Mi Lista',
    tabMovies: 'Películas',
    tabVose: 'VO · Inglés',
    tabSeries: 'Series TV',
    tabTdt: 'TV España',
    tabSports: 'Fútbol · Vivo',
    tabYoutube: 'YouTube',
    tabDirect: 'Cola · Enlace',
    tabChat: 'Chat',
    tabRoom: 'Sala',
    tabMyList: 'Mi lista',
    searchMoviesPlaceholder: 'Buscar películas (Español o VO Inglés 1080p)...',
    searchVoPlaceholder: 'Buscar cine en VO / Inglés 1080p...',
    searchSeriesPlaceholder: 'Buscar series de TV en Español o VO...',
    searchTdtPlaceholder: 'Buscar canal en vivo (La 1, Antena 3, Movistar, DAZN...)',
    searchSportsPlaceholder: 'Buscar partido, LaLiga, Champions, F1 o canal...',
    searchYoutubePlaceholder: 'Buscar vídeos, música, resúmenes o canales en YouTube...',
    unmuteAudio: 'Activar sonido',
    liveNow: 'EN DIRECTO',
    syncRoom: 'Sincronizar',
    invite: 'Invitar',
    smartTv: 'Smart TV',
    leaveRoom: 'Salir',
    chatPlaceholder: 'Escribe un mensaje a la sala...',
    send: 'Enviar',
    participants: 'En la sala',
    hostLabel: 'Anfitrión',
    modLabel: 'Co-anfitrión',
    makeHost: 'Hacer anfitrión',
    you: 'Tú',
    copyLink: 'Copiar enlace',
    copied: 'Copiado',
    extractingTitle: 'Conectando señal…',
    extractingSub: 'Sincronizando con tu sala',
    standbyTitle: 'Sala lista para proyectar',
    standbySub: 'Elige una película, serie, canal en directo, partido o YouTube abajo.',
    directTitle: 'Enlace directo y navegador web integrado',
    directSub:
      'Pega cualquier enlace de YouTube, vídeo directo o página web para reproducirlo limpio en tu sala.',
    playNativeBtn: 'Reproducir en reproductor',
    openWebBtn: 'Abrir navegador web',
    openCloudBtn: 'Abrir navegador web',
    switchNativeHd: 'Pasar a reproductor HD',
    allSports: 'Todos',
    soccer: 'Fútbol',
    motor: 'F1 · Motor',
    basketball: 'Baloncesto',
    tennis: 'Tenis',
    notificationsTitle: 'Centro de notificaciones',
    surpriseMeTitle: 'Sorpréndeme',
    legalTitle: 'Privacidad, Términos y Aviso Legal',
    qualityLabel: 'Calidad de vídeo',
    qualityAuto: 'Auto',
    audioTrackLabel: 'Pista de audio',
    audioTrackEmbedded: 'Audio del vídeo',
    closeModal: 'Cerrar ventana',
    watchNow: 'Ver ahora',
    addToQueue: 'A la cola',
    infoLabel: 'Ficha',
    trailerPreviewMute: 'Silenciar avance',
    trailerPreviewUnmute: 'Sonido del avance',
  },
  ca: {
    appTagline: 'RiffanTV · Cinema, Sèries, TV en directe, Futbol i YouTube sincronitzat',
    heroHeadline: 'La teva sala privada per veure cinema, sèries, TV i esport junts.',
    heroDescription:
      'Catàleg complet en Català, Castellà i VO 1080p, més canals de TV en directe, futbol en temps real i sales sincronitzades sense anuncis.',
    nicknameLabel: 'El teu nom a la sala',
    nicknamePlaceholder: 'Escriu el teu nom (ex. Naim, Laia, Marc...)',
    avatarLabel: 'Identitat',
    accentLabel: 'To',
    createRoomBtn: 'Crear sala i entrar',
    joinRoomLabel: 'Unir-se amb codi o enllaç',
    roomCodePlaceholder: 'Codi o enllaç (ex. a8f2)',
    joinBtn: 'Unir-se',
    recentRooms: 'Sales recents',
    pillarExplore: 'Explorar',
    pillarCatalog: 'Sèries i Cinema',
    pillarAnime: 'Anime',
    pillarLive: 'En Directe',
    pillarMyList: 'La meva llista',
    tabMovies: 'Pel·lícules',
    tabVose: 'VO · Anglès',
    tabSeries: 'Sèries TV',
    tabTdt: 'TV Espanya',
    tabSports: 'Futbol · Viu',
    tabYoutube: 'YouTube',
    tabDirect: 'Cua · Enllaç',
    tabChat: 'Xat',
    tabRoom: 'Sala',
    tabMyList: 'La meva llista',
    searchMoviesPlaceholder: 'Cercar pel·lícules (Català, Castellà o VO 1080p)...',
    searchVoPlaceholder: 'Cercar cinema en VO / Anglès 1080p...',
    searchSeriesPlaceholder: 'Cercar sèries de TV en Català, Castellà o VO...',
    searchTdtPlaceholder: 'Cercar canal en directe (TV3, La 1, Movistar, DAZN...)',
    searchSportsPlaceholder: 'Cercar partit, LaLiga, Champions, F1 o canal...',
    searchYoutubePlaceholder: 'Cercar vídeos, música, resums o canals a YouTube...',
    unmuteAudio: 'Activar so',
    liveNow: 'EN DIRECTE',
    syncRoom: 'Sincronitzar',
    invite: 'Convidar',
    smartTv: 'Smart TV',
    leaveRoom: 'Sortir',
    chatPlaceholder: 'Escriu un missatge a la sala...',
    send: 'Enviar',
    participants: 'A la sala',
    hostLabel: 'Amfitrió',
    modLabel: 'Co-amfitrió',
    makeHost: 'Fer amfitrió',
    you: 'Tu',
    copyLink: 'Copiar enllaç',
    copied: 'Copiat',
    extractingTitle: 'Connectant senyal…',
    extractingSub: 'Sincronitzant amb la teva sala',
    standbyTitle: 'Sala preparada per projectar',
    standbySub: 'Tria una pel·lícula, sèrie, canal en directe, partit o YouTube a sota.',
    directTitle: 'Enllaç directe i navegador web integrat',
    directSub:
      'Enganxa qualsevol enllaç de YouTube, vídeo directe o pàgina web per reproduir-lo net a la sala.',
    playNativeBtn: 'Reproduir al reproductor',
    openWebBtn: 'Obrir navegador web',
    openCloudBtn: 'Obrir navegador web',
    switchNativeHd: 'Passar a reproductor HD',
    allSports: 'Tots',
    soccer: 'Futbol',
    motor: 'F1 · Motor',
    basketball: 'Bàsquet',
    tennis: 'Tennis',
    notificationsTitle: 'Centre de notificacions',
    surpriseMeTitle: 'Sorprèn-me',
    legalTitle: 'Privacitat, Termes i Avís Legal',
    qualityLabel: 'Qualitat de vídeo',
    qualityAuto: 'Auto',
    audioTrackLabel: 'Pista d’àudio',
    audioTrackEmbedded: 'Àudio del vídeo',
    closeModal: 'Tancar finestra',
    watchNow: 'Veure ara',
    addToQueue: 'A la cua',
    infoLabel: 'Fitxa',
    trailerPreviewMute: 'Silenciar avançament',
    trailerPreviewUnmute: 'So de l’avançament',
  },
  en: {
    appTagline: 'RiffanTV · Synchronized Movies, Series, Live TV, Sports & YouTube',
    heroHeadline: 'Your private theater for movies, series, and live sports together.',
    heroDescription:
      'Full catalog in English 1080p, Spanish and Catalan, plus live TV channels, real-time football matchboard, and synced rooms.',
    nicknameLabel: 'Your display name',
    nicknamePlaceholder: 'Enter your name (e.g. Naim, Alex, Sofia...)',
    avatarLabel: 'Identity',
    accentLabel: 'Tone',
    createRoomBtn: 'Create room & enter',
    joinRoomLabel: 'Join with code or link',
    roomCodePlaceholder: 'Code or link (e.g. a8f2)',
    joinBtn: 'Join',
    recentRooms: 'Recent rooms',
    pillarExplore: 'Explore',
    pillarCatalog: 'Series & Movies',
    pillarAnime: 'Anime',
    pillarLive: 'Live TV & Sports',
    pillarMyList: 'My List',
    tabMovies: 'Movies',
    tabVose: 'VO · English',
    tabSeries: 'TV Series',
    tabTdt: 'Live TV',
    tabSports: 'Live Sports',
    tabYoutube: 'YouTube',
    tabDirect: 'Queue · Link',
    tabChat: 'Chat',
    tabRoom: 'Room',
    tabMyList: 'My List',
    searchMoviesPlaceholder: 'Search movies in English, Spanish, or Catalan...',
    searchVoPlaceholder: 'Search Original English 1080p movies...',
    searchSeriesPlaceholder: 'Search TV series...',
    searchTdtPlaceholder: 'Search live channel...',
    searchSportsPlaceholder: 'Search match, Champions League, F1, or channel...',
    searchYoutubePlaceholder: 'Search YouTube videos, music, highlights, or channels...',
    unmuteAudio: 'Tap to unmute',
    liveNow: 'LIVE',
    syncRoom: 'Resync',
    invite: 'Invite Friends',
    smartTv: 'Smart TV',
    leaveRoom: 'Leave',
    chatPlaceholder: 'Message your room...',
    send: 'Send',
    participants: 'Friends in room',
    hostLabel: 'Host',
    modLabel: 'Co-host',
    makeHost: 'Make host',
    you: 'You',
    copyLink: 'Copy invite link',
    copied: 'Link copied',
    extractingTitle: 'Connecting signal…',
    extractingSub: 'Syncing with your room',
    standbyTitle: 'RiffanTV ready to screen',
    standbySub: 'Pick any movie, TV series episode, live match, or YouTube video below.',
    directTitle: 'Direct Stream Link & Integrated Web Browser',
    directSub:
      'Paste any YouTube, direct media link, or web page to play cleanly in your room.',
    playNativeBtn: 'Play in Player',
    openWebBtn: 'Open Web Browser',
    openCloudBtn: 'Open Web Browser',
    switchNativeHd: 'Switch to HD Player',
    allSports: 'All',
    soccer: 'Football',
    motor: 'F1 · Motor',
    basketball: 'Basketball',
    tennis: 'Tennis',
    notificationsTitle: 'Notifications',
    surpriseMeTitle: 'Surprise Me',
    legalTitle: 'Privacy, Terms & Legal Notice',
    qualityLabel: 'Video quality',
    qualityAuto: 'Auto',
    audioTrackLabel: 'Audio track',
    audioTrackEmbedded: 'Embedded audio',
    closeModal: 'Close dialog',
    watchNow: 'Watch now',
    addToQueue: 'Add to queue',
    infoLabel: 'Details',
    trailerPreviewMute: 'Mute preview',
    trailerPreviewUnmute: 'Unmute preview',
  },
};
