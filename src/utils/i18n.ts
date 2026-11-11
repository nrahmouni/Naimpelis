import { AppLanguage } from '../types';

export const UI_COPY: Record<
  AppLanguage,
  {
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
    tabMovies: string;
    tabVose: string;
    tabSeries: string;
    tabSports: string;
    tabYoutube: string;
    tabDirect: string;
    tabChat: string;
    tabRoom: string;
    searchMoviesPlaceholder: string;
    searchBingetrixPlaceholder: string;
    searchSeriesPlaceholder: string;
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
    openCloudBtn: string;
    switchNativeHd: string;
    allSports: string;
    soccer: string;
    motor: string;
    basketball: string;
    tennis: string;
  }
> = {
  es: {
    appTagline: 'NAIM CINE · Cine, Series, Fútbol y YouTube Sincronizado',
    heroHeadline: 'Elige tu avatar, entra a tu sala y miradlo todo juntos en vivo.',
    heroDescription:
      'Películas en Español, Latino y Bingetrix 1080p en Inglés, todas las series por temporadas, fútbol en directo y YouTube sincronizado al milisegundo con tus amigos.',
    nicknameLabel: 'Tu nombre o apodo',
    nicknamePlaceholder: 'Ej. Naim, Carlos, Marta...',
    avatarLabel: 'Elige tu Avatar',
    accentLabel: 'Aura Neón',
    createRoomBtn: 'Crear Sala y Entrar Ahora',
    joinRoomLabel: '¿Tienes código de un amigo? Únete directo',
    roomCodePlaceholder: 'Ej. naim-vip',
    joinBtn: 'Entrar',
    recentRooms: 'Tus salas recientes',
    tabMovies: 'Películas',
    tabVose: 'Bingetrix EN',
    tabSeries: 'Series TV',
    tabSports: 'Fútbol · Vivo',
    tabYoutube: 'YouTube',
    tabDirect: 'Cola · Enlace',
    tabChat: 'Chat',
    tabRoom: 'Sala',
    searchMoviesPlaceholder: 'Buscar cualquier película en Español, Latino o Inglés...',
    searchBingetrixPlaceholder: 'Buscar entre +500.000 películas en Bingetrix (Inglés 1080p)...',
    searchSeriesPlaceholder: 'Buscar cualquier serie (Breaking Bad, Stranger Things, La Casa de Papel...)',
    searchSportsPlaceholder: 'Buscar partido, LaLiga, Champions, F1 o canal...',
    searchYoutubePlaceholder: 'Buscar vídeos, música, resúmenes o canales en YouTube...',
    unmuteAudio: 'Activar sonido',
    liveNow: 'EN DIRECTO',
    syncRoom: 'Sincronizar',
    invite: 'Invitar Amigos',
    smartTv: 'Smart TV',
    leaveRoom: 'Salir',
    chatPlaceholder: 'Escribe un mensaje a la sala...',
    send: 'Enviar',
    participants: 'Amigos en sala',
    hostLabel: 'Anfitrión',
    makeHost: 'Ceder control',
    you: 'Tú',
    copyLink: 'Copiar invitación',
    copied: 'Link copiado',
    extractingTitle: 'Preparando proyección HD sin anuncios...',
    extractingSub: 'Conectando audio multi-idioma y sincronizando tu sala NAIM CINE',
    standbyTitle: 'NAIM CINE listo para proyectar',
    standbySub: 'Elige una película, episodio de serie, partido en vivo o vídeo de YouTube abajo.',
    directTitle: 'Enlace Universal y Cloud Browser Sin Publicidad',
    directSub:
      'Pega cualquier enlace de YouTube, archivo .m3u8 / .mp4 o cualquier página web para extraer el vídeo limpio o navegar sin ventanas emergentes.',
    playNativeBtn: 'Reproducir Sin Anuncios',
    openCloudBtn: 'Abrir en Cloud Browser',
    switchNativeHd: 'Pasar a Reproductor Nativo HD',
    allSports: 'Todos',
    soccer: 'Fútbol',
    motor: 'F1 · Motor',
    basketball: 'Baloncesto',
    tennis: 'Tenis',
  },
  en: {
    appTagline: 'NAIM CINE · Synchronized Movies, Series, Live Sports & YouTube',
    heroHeadline: 'Pick your avatar, launch your private room, and watch together live.',
    heroDescription:
      'Full Bingetrix 1080p English catalog + Spanish/Latino dubs, complete TV series with seasons & episodes, live football channels, and synchronized YouTube.',
    nicknameLabel: 'Your display name',
    nicknamePlaceholder: 'e.g. Naim, Alex, Sofia...',
    avatarLabel: 'Choose your Avatar',
    accentLabel: 'Neon Aura',
    createRoomBtn: 'Create Room & Enter Now',
    joinRoomLabel: 'Have a friend’s room code? Join directly',
    roomCodePlaceholder: 'e.g. naim-vip',
    joinBtn: 'Join',
    recentRooms: 'Your recent rooms',
    tabMovies: 'Movies',
    tabVose: 'Bingetrix EN',
    tabSeries: 'TV Series',
    tabSports: 'Live Sports',
    tabYoutube: 'YouTube',
    tabDirect: 'Queue · Link',
    tabChat: 'Chat',
    tabRoom: 'Room',
    searchMoviesPlaceholder: 'Search any movie in English, Spanish, or Latino...',
    searchBingetrixPlaceholder: 'Search 500,000+ movies on Bingetrix (English 1080p)...',
    searchSeriesPlaceholder: 'Search any TV series (Breaking Bad, Severance, Game of Thrones...)',
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
    makeHost: 'Make host',
    you: 'You',
    copyLink: 'Copy invite link',
    copied: 'Link copied',
    extractingTitle: 'Preparing clean HD screening...',
    extractingSub: 'Extracting ad-free HLS stream and syncing your NAIM CINE room',
    standbyTitle: 'NAIM CINE ready to screen',
    standbySub: 'Pick any movie, TV series episode, live match, or YouTube video below.',
    directTitle: 'Universal Stream Decompiler & Cloud Browser',
    directSub:
      'Paste any YouTube, .m3u8 / .mp4, or web URL to extract clean native video or browse inside a server-isolated session with zero popups.',
    playNativeBtn: 'Play Ad-Free Native',
    openCloudBtn: 'Open in Cloud Browser',
    switchNativeHd: 'Switch to Native HD Player',
    allSports: 'All',
    soccer: 'Football',
    motor: 'F1 · Motor',
    basketball: 'Basketball',
    tennis: 'Tennis',
  },
};
