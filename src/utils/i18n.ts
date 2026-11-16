import type { AppLanguage } from '../types';
import { lookupZhTranslation } from './zhTranslations';
import { lookupRifTranslation } from './rifTranslations';

export interface LocalizedTextMap {
  es: string;
  ca: string;
  en: string;
  zh?: string;
  rif?: string;
}

/**
 * Type-safe language selector ensuring Spanish (es), Catalan (ca), English (en), Chinese (zh), and Riffian (rif)
 * never silently fall back to Spanish when another language is active.
 */
export function pickLang(lang: AppLanguage, copy: LocalizedTextMap): string {
  if (lang === 'ca') return copy.ca;
  if (lang === 'en') return copy.en;
  if (lang === 'rif') {
    if (copy.rif) return copy.rif;
    const translated = lookupRifTranslation(copy.en, copy.es);
    if (translated) return translated;
    return copy.en || copy.es;
  }
  if (lang === 'zh') {
    if (copy.zh) return copy.zh;
    const translated = lookupZhTranslation(copy.en, copy.es);
    if (translated) return translated;
    return copy.en || copy.es;
  }
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
  zh: {
    appTagline: 'RiffanTV · 电影、剧集、直播电视、体育赛事与好友同步观影',
    heroHeadline: '专属于你与好友的私人影院，电影、剧集、直播与体育同步畅享。',
    heroDescription:
      '支持中文界面与西语/加泰语/英语 1080p 影视片库，实时体育直播与零延迟同步房间。',
    nicknameLabel: '房间昵称',
    nicknamePlaceholder: '输入你的昵称（如 Naim、Alex、小明...）',
    avatarLabel: '头像形象',
    accentLabel: '主题色',
    createRoomBtn: '创建并进入房间',
    joinRoomLabel: '通过房间码或链接加入',
    roomCodePlaceholder: '输入房间码或链接（如 a8f2）',
    joinBtn: '加入',
    recentRooms: '最近房间',
    pillarExplore: '探索',
    pillarCatalog: '影视剧集',
    pillarAnime: '动漫',
    pillarLive: '电视直播',
    pillarMyList: '我的片单',
    tabMovies: '电影',
    tabVose: '原声 · 英语',
    tabSeries: '剧集',
    tabTdt: '直播电视',
    tabSports: '体育直播',
    tabYoutube: 'YouTube',
    tabDirect: '队列 · 链接',
    tabChat: '聊天',
    tabRoom: '房间',
    tabMyList: '片单',
    searchMoviesPlaceholder: '搜索电影（西语 / 英语 1080p）...',
    searchVoPlaceholder: '搜索原声英语 1080p 电影...',
    searchSeriesPlaceholder: '搜索热门电视剧集...',
    searchTdtPlaceholder: '搜索电视频道...',
    searchSportsPlaceholder: '搜索足球比赛、欧冠、F1 或频道...',
    searchYoutubePlaceholder: '搜索 YouTube 视频、音乐或频道...',
    unmuteAudio: '点击开启声音',
    liveNow: '直播中',
    syncRoom: '同步',
    invite: '邀请好友',
    smartTv: '智能电视',
    leaveRoom: '退出',
    chatPlaceholder: '在房间发送消息...',
    send: '发送',
    participants: '房间好友',
    hostLabel: '房主',
    modLabel: '管理员',
    makeHost: '设为房主',
    you: '你',
    copyLink: '复制邀请链接',
    copied: '已复制',
    extractingTitle: '正在连接信号…',
    extractingSub: '正在与房间同步',
    standbyTitle: '影院房间已准备就绪',
    standbySub: '选择下方的电影、剧集、直播频道或赛事开始播放。',
    directTitle: '直链与内置浏览器',
    directSub: '粘贴 YouTube 链接、视频直链或网页，即刻在房间同步播放。',
    playNativeBtn: '在播放器中播放',
    openWebBtn: '打开内置网页',
    openCloudBtn: '打开内置网页',
    switchNativeHd: '切换高清播放器',
    allSports: '全部',
    soccer: '足球',
    motor: 'F1 · 赛车',
    basketball: '篮球',
    tennis: '网球',
    notificationsTitle: '通知中心',
    surpriseMeTitle: '随机推荐',
    legalTitle: '隐私政策与法律声明',
    qualityLabel: '画质',
    qualityAuto: '自动',
    audioTrackLabel: '音轨语言',
    audioTrackEmbedded: '内置音频',
    closeModal: '关闭窗口',
    watchNow: '立即观看',
    addToQueue: '加入队列',
    infoLabel: '详情',
    trailerPreviewMute: '静音预览',
    trailerPreviewUnmute: '开启预览声音',
  },
  rif: {
    appTagline: 'RiffanTV · Lafilmat, Siriyat, Talfaza direkt, Takurt n uḍar d YouTube',
    heroHeadline: 'Taxxamt aked imddukkal i lafilmat, siriyat, talfaza d takurt.',
    heroDescription:
      'Katalog n lafilmat d siriyat s Tarifit, Sblyuni d Tenglizt 1080p, d talfaza direkt d takurt n uḍar.',
    nicknameLabel: 'Isem nnec di taxxamt',
    nicknamePlaceholder: 'Aru isem nnec (am Naim, Karim...)',
    avatarLabel: "L'identiti",
    accentLabel: 'Ini',
    createRoomBtn: 'Sker taxxamt tajdit',
    joinRoomLabel: 'Udef s lkod neɣ llyan',
    roomCodePlaceholder: 'Lkod neɣ llyan (am a8f2)',
    joinBtn: 'Udef',
    recentRooms: 'Tixxamin nniḍen n tura',
    pillarExplore: 'Nadi',
    pillarCatalog: 'Lafilmat d Siriyat',
    pillarAnime: 'Anime',
    pillarLive: 'Talfaza Direkt',
    pillarMyList: 'Iḥefḍen',
    tabMovies: 'Lafilmat',
    tabVose: 'Tenglizt',
    tabSeries: 'Siriyat',
    tabTdt: 'Talfaza',
    tabSports: 'Takurt n uḍar',
    tabYoutube: 'YouTube',
    tabDirect: 'Llista',
    tabChat: 'Ccat',
    tabRoom: 'Taxxamt',
    tabMyList: 'Iḥefḍen',
    searchMoviesPlaceholder: 'Nadi lafilmat (Tarifit, Sblyuni d Tenglizt 1080p)...',
    searchVoPlaceholder: 'Nadi lafilmat s Tenglizt 1080p...',
    searchSeriesPlaceholder: 'Nadi siriyat n talfaza...',
    searchTdtPlaceholder: 'Nadi talfaza direkt...',
    searchSportsPlaceholder: 'Nadi takurt n uḍar, F1 d waddal...',
    searchYoutubePlaceholder: 'Nadi ividyuten n YouTube...',
    unmuteAudio: 'Cɛel imesli',
    liveNow: 'DIREKT',
    syncRoom: 'Sankronizi',
    invite: 'Eɛreḍ',
    smartTv: 'Smart TV',
    leaveRoom: 'Ffeɣ',
    chatPlaceholder: 'Aru awal i taxxamt...',
    send: 'Azen',
    participants: 'Imddukkal di taxxamt',
    hostLabel: 'Anemhal',
    modLabel: 'Amedyaz',
    makeHost: 'Err-it d anemhal',
    you: 'Cek',
    copyLink: 'Nseq llyan',
    copied: 'Yenseq',
    extractingTitle: 'Yessikiyed uzeṭṭa…',
    extractingSub: 'Sankronizi aked taxxamt nnec',
    standbyTitle: 'Taxxamt tura twejjed i uxzari',
    standbySub: 'Xtar lfilm, siriya, talfaza direkt neɣ YouTube swadday.',
    directTitle: 'Llyan n uzeṭṭa d usmel web',
    directSub: 'Ssekcem llyan n YouTube neɣ web bach ad txzared di taxxamt nnec.',
    playNativeBtn: 'Xzar di lecran',
    openWebBtn: 'Rzem asmel web',
    openCloudBtn: 'Rzem asmel web',
    switchNativeHd: 'Beddel ɣer HD',
    allSports: 'Kullci',
    soccer: 'Takurt n uḍar',
    motor: 'F1 · Motor',
    basketball: 'Basketball',
    tennis: 'Tennis',
    notificationsTitle: "L'ixbarat",
    surpriseMeTitle: 'Xtar-ayi s zhar',
    legalTitle: 'Curut n useqdec',
    qualityLabel: 'Lkałiti n lfilm',
    qualityAuto: 'Automatique',
    audioTrackLabel: 'Awal n lfilm',
    audioTrackEmbedded: 'Imesli n lfilm',
    closeModal: 'Mdel',
    watchNow: 'Xzar tura',
    addToQueue: 'Rnu ɣer llista',
    infoLabel: "L'ixbarat",
    trailerPreviewMute: 'Ssens imesli',
    trailerPreviewUnmute: 'Cɛel imesli',
  },
};
