import type { Express, Request, Response } from 'express';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import type { CatalogMovie, SpanishTdtChannel, SportsMatch, WatchHistoryItem } from '../../src/types.ts';
import {
  buildTmdbImageUrl,
  fetchTmdbJson,
  resolveTmdbLanguageTag,
} from '../services/tmdbService.ts';
import {
  fetchFotmobDayIndex,
  getMadridDateKey,
} from '../services/footballLiveService.ts';
import { logger } from '../utils/logger.ts';

export type VoiceIntent =
  | 'play_channel'
  | 'play_match'
  | 'play_movie'
  | 'play_series'
  | 'recommend_movies'
  | 'recommend_series'
  | 'browse_channels'
  | 'select_ordinal'
  | 'resume_history'
  | 'sports_info'
  | 'open_world'
  | 'player_control'
  | 'chat';

export interface VoiceAssistantAction {
  type: 'open_world' | 'player_control' | 'open_friends' | 'surprise_me';
  payload?: string;
}

export interface VoiceChatHistoryTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface VoiceAssistantCandidateItem {
  kind: 'channel' | 'movie' | 'series' | 'match';
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  badge?: string;
  targetSeason?: number;
  targetEpisode?: number;
  channel?: SpanishTdtChannel & { logoUrl?: string };
  media?: CatalogMovie & { targetSeason?: number; targetEpisode?: number };
  match?: SportsMatch;
}

export interface ParsedVoiceIntent {
  spokenReply: string;
  intent: VoiceIntent;
  autoPlay: boolean;
  action?: VoiceAssistantAction;
  channelKeywords: string[];
  categoryHint: string;
  matchKeywords: string[];
  targetSeason?: number;
  targetEpisode?: number;
  tmdbQuery: {
    mediaType: 'movie' | 'tv' | 'multi';
    genreId?: number;
    timeframe?: 'this_month' | 'this_year' | 'all_time' | 'trending';
    sortBy?: 'top_rated' | 'popular' | 'newest';
    limit: number;
    titleSearch?: string;
  };
}

export interface RegisterVoiceAssistantDeps {
  getChannels: () => Array<SpanishTdtChannel & { logoUrl?: string }>;
  resolveLogoUrl: (ch: { id: string; name?: string; shortMark?: string; logoUrl?: string | null }) => string | null | undefined;
  getSportsMatches: () => Promise<SportsMatch[]>;
}

interface TmdbDiscoverResult {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  media_type?: 'movie' | 'tv' | 'person';
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function normalizeSearchStr(input: string): string {
  return String(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectOrdinalSelection(query: string): number | null {
  const norm = normalizeSearchStr(query);
  if (!norm || norm.length > 48) return null;
  const prefix = '(?:(?:ponme|pon|abre|reproduce|dame|ver|quiero ver|quiero)\\s+)?(?:(?:el|la|numero|n)\\s+)?';
  if (new RegExp(`^${prefix}(primera|primero|uno|1a|1o|1)$`).test(norm)) {
    return 0;
  }
  if (new RegExp(`^${prefix}(segunda|segundo|dos|2a|2o|2)$`).test(norm)) {
    return 1;
  }
  if (new RegExp(`^${prefix}(tercera|tercero|tres|3a|3o|3)$`).test(norm)) {
    return 2;
  }
  if (new RegExp(`^${prefix}(cuarta|cuarto|cuatro|4a|4o|4)$`).test(norm)) {
    return 3;
  }
  if (new RegExp(`^${prefix}(quinta|quinto|cinco|5a|5o|5)$`).test(norm)) {
    return 4;
  }
  return null;
}

const WORD_TO_NUMBER: Record<string, number> = {
  primera: 1,
  primer: 1,
  primero: 1,
  uno: 1,
  '1a': 1,
  '1o': 1,
  '1': 1,
  segunda: 2,
  segundo: 2,
  dos: 2,
  '2a': 2,
  '2o': 2,
  '2': 2,
  tercera: 3,
  tercer: 3,
  tercero: 3,
  tres: 3,
  '3a': 3,
  '3o': 3,
  '3': 3,
  cuarta: 4,
  cuarto: 4,
  cuatro: 4,
  '4a': 4,
  '4o': 4,
  '4': 4,
  quinta: 5,
  quinto: 5,
  cinco: 5,
  '5a': 5,
  '5o': 5,
  '5': 5,
  sexta: 6,
  sexto: 6,
  seis: 6,
  '6': 6,
  septima: 7,
  septimo: 7,
  siete: 7,
  '7': 7,
  octava: 8,
  octavo: 8,
  ocho: 8,
  '8': 8,
  novena: 9,
  noveno: 9,
  nueve: 9,
  '9': 9,
  decima: 10,
  decimo: 10,
  diez: 10,
  '10': 10,
};

export function parseSeriesSeasonAndEpisode(rawQuery: string): {
  season?: number;
  episode?: number;
  cleanTitle: string;
  hasEpisodeRequest: boolean;
} {
  const norm = normalizeSearchStr(rawQuery);
  let season: number | undefined;
  let episode: number | undefined;
  let hasEpisodeRequest = false;

  const epMatch = norm.match(
    /\b(?:el\s+)?(?:capitulo|cap|episodio|ep)\s+([0-9]{1,3}|primera|primer|primero|uno|segunda|segundo|dos|tercera|tercer|tercero|tres|cuarta|cuarto|cuatro|quinta|quinto|cinco|sexta|sexto|seis|septima|septimo|siete|octava|octavo|ocho|novena|noveno|nueve|decima|decimo|diez)\b/i
  );
  if (epMatch) {
    const rawVal = epMatch[1].toLowerCase();
    episode = /^\d+$/.test(rawVal) ? Number(rawVal) : WORD_TO_NUMBER[rawVal];
    if (episode) hasEpisodeRequest = true;
  }

  const seasonMatch1 = norm.match(
    /\b(primera|primer|primero|uno|segunda|segundo|dos|tercera|tercer|tercero|tres|cuarta|cuarto|cuatro|quinta|quinto|cinco|sexta|sexto|seis|septima|septimo|siete|octava|octavo|ocho|novena|noveno|nueve|decima|decimo|diez)\s+temporada\b/i
  );
  const seasonMatch2 = norm.match(
    /\b(?:la\s+)?(?:temporada|temp|t)\s+([0-9]{1,2}|primera|primer|primero|uno|segunda|segundo|dos|tercera|tercer|tercero|tres|cuarta|cuarto|cuatro|quinta|quinto|cinco|sexta|sexto|seis|septima|septimo|siete|octava|octavo|ocho|novena|noveno|nueve|decima|decimo|diez)\b/i
  );

  if (seasonMatch1) {
    const rawVal = seasonMatch1[1].toLowerCase();
    season = /^\d+$/.test(rawVal) ? Number(rawVal) : WORD_TO_NUMBER[rawVal];
  } else if (seasonMatch2) {
    const rawVal = seasonMatch2[1].toLowerCase();
    season = /^\d+$/.test(rawVal) ? Number(rawVal) : WORD_TO_NUMBER[rawVal];
  }

  if (episode && !season) {
    season = 1;
  }

  const cleaned = norm
    .replace(/^(?:quiero ver|quiero|ponme|pon|abre|reproduce|ver|busca|buscame)\s+/g, '')
    .replace(
      /\b(?:el\s+)?(?:capitulo|cap|episodio|ep)\s+([0-9]{1,3}|primera|primer|primero|uno|segunda|segundo|dos|tercera|tercer|tercero|tres|cuarta|cuarto|cuatro|quinta|quinto|cinco|sexta|sexto|seis|septima|septimo|siete|octava|octavo|ocho|novena|noveno|nueve|decima|decimo|diez)\b/gi,
      ''
    )
    .replace(
      /\b(?:la\s+)?(?:temporada|temp|t)\s+([0-9]{1,2}|primera|primer|primero|uno|segunda|segundo|dos|tercera|tercer|tercero|tres|cuarta|cuarto|cuatro|quinta|quinto|cinco|sexta|sexto|seis|septima|septimo|siete|octava|octavo|ocho|novena|noveno|nueve|decima|decimo|diez)\b/gi,
      ''
    )
    .replace(
      /\b(primera|primer|primero|uno|segunda|segundo|dos|tercera|tercer|tercero|tres|cuarta|cuarto|cuatro|quinta|quinto|cinco|sexta|sexto|seis|septima|septimo|siete|octava|octavo|ocho|novena|noveno|nueve|decima|decimo|diez)\s+temporada\b/gi,
      ''
    )
    .replace(/\b(?:de la|de el|del|de|la|el|serie|episodio|capitulo)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    season,
    episode,
    cleanTitle: cleaned,
    hasEpisodeRequest,
  };
}

const GENRE_KEYWORD_MAP: Array<{ pattern: RegExp; movieId: number; tvId: number; labelEs: string }> = [
  { pattern: /\b(terror|miedo|horror|susto|slasher)\b/i, movieId: 27, tvId: 9648, labelEs: 'terror' },
  { pattern: /\b(comedia|risa|humor|reir|graciosa|graciosas)\b/i, movieId: 35, tvId: 35, labelEs: 'comedia' },
  { pattern: /\b(accion|action|tiros|pelea)\b/i, movieId: 28, tvId: 10759, labelEs: 'acción' },
  { pattern: /\b(ciencia ficcion|sci fi|scifi|futuro|espacio)\b/i, movieId: 878, tvId: 10765, labelEs: 'ciencia ficción' },
  { pattern: /\b(thriller|suspense|intriga|misterio)\b/i, movieId: 53, tvId: 9648, labelEs: 'suspense' },
  { pattern: /\b(drama|llorar)\b/i, movieId: 18, tvId: 18, labelEs: 'drama' },
  { pattern: /\b(animacion|dibujos|infantil|familia|ninos|peques)\b/i, movieId: 16, tvId: 16, labelEs: 'animación' },
  { pattern: /\b(romance|amor|romantica|romanticas)\b/i, movieId: 10749, tvId: 18, labelEs: 'romance' },
  { pattern: /\b(documental|documentales|naturaleza|historia)\b/i, movieId: 99, tvId: 99, labelEs: 'documental' },
];

export function buildFallbackVoicePlan(query: string, lang: string): ParsedVoiceIntent {
  const norm = normalizeSearchStr(query);
  const limitMatch = norm.match(/\b([1-9])\s*(pelis|peliculas|series|canales|opciones|resultados|titulos)?\b/);
  const limit = limitMatch ? Math.max(1, Math.min(8, Number(limitMatch[1]))) : 4;

  // Player controls (pause, play, mute, fullscreen, next episode)
  if (/\b(pausa|pausar|deten|para la peli|para el video|pause|stop playing)\b/.test(norm)) {
    return {
      spokenReply: lang === 'en' ? 'Pausing playback.' : lang === 'ca' ? 'Pausant la reproducció.' : lang === 'zh' ? '正在暂停播放。' : 'Pausando la reproducción.',
      intent: 'player_control',
      autoPlay: false,
      action: { type: 'player_control', payload: 'pause' },
      channelKeywords: [],
      categoryHint: '',
      matchKeywords: [],
      tmdbQuery: { mediaType: 'multi', limit: 1 },
    };
  }
  if (/\b(reanuda|reproducir|dale al play|pon play|continua|resume|unpause)\b/.test(norm)) {
    return {
      spokenReply: lang === 'en' ? 'Resuming playback.' : lang === 'ca' ? 'Reprenent la reproducció.' : lang === 'zh' ? '正在继续播放。' : 'Reanudando la reproducción.',
      intent: 'player_control',
      autoPlay: false,
      action: { type: 'player_control', payload: 'play' },
      channelKeywords: [],
      categoryHint: '',
      matchKeywords: [],
      tmdbQuery: { mediaType: 'multi', limit: 1 },
    };
  }
  if (/\b(silencia|quita el sonido|mutear|sin sonido|mute)\b/.test(norm)) {
    return {
      spokenReply: lang === 'en' ? 'Muting audio.' : lang === 'ca' ? 'Silenciant l’àudio.' : lang === 'zh' ? '已静音。' : 'Silenciando el audio.',
      intent: 'player_control',
      autoPlay: false,
      action: { type: 'player_control', payload: 'mute' },
      channelKeywords: [],
      categoryHint: '',
      matchKeywords: [],
      tmdbQuery: { mediaType: 'multi', limit: 1 },
    };
  }
  if (/\b(activa el sonido|pon el sonido|quita el mute|unmute)\b/.test(norm)) {
    return {
      spokenReply: lang === 'en' ? 'Sound restored.' : lang === 'ca' ? 'So activat.' : lang === 'zh' ? '已恢复声音。' : 'Sonido activado.',
      intent: 'player_control',
      autoPlay: false,
      action: { type: 'player_control', payload: 'unmute' },
      channelKeywords: [],
      categoryHint: '',
      matchKeywords: [],
      tmdbQuery: { mediaType: 'multi', limit: 1 },
    };
  }
  if (/\b(pantalla completa|fullscreen|hazlo grande)\b/.test(norm)) {
    return {
      spokenReply: lang === 'en' ? 'Switching to fullscreen.' : lang === 'ca' ? 'Posant pantalla completa.' : lang === 'zh' ? '正在切换全屏。' : 'Poniendo pantalla completa.',
      intent: 'player_control',
      autoPlay: false,
      action: { type: 'player_control', payload: 'fullscreen' },
      channelKeywords: [],
      categoryHint: '',
      matchKeywords: [],
      tmdbQuery: { mediaType: 'multi', limit: 1 },
    };
  }
  if (/\b(siguiente capitulo|siguiente episodio|proximo episodio|next episode)\b/.test(norm)) {
    return {
      spokenReply: lang === 'en' ? 'Loading the next episode.' : lang === 'ca' ? 'Carregant el següent capítol.' : lang === 'zh' ? '正在加载下一集。' : 'Pasando al siguiente capítulo.',
      intent: 'player_control',
      autoPlay: false,
      action: { type: 'player_control', payload: 'next_episode' },
      channelKeywords: [],
      categoryHint: '',
      matchKeywords: [],
      tmdbQuery: { mediaType: 'multi', limit: 1 },
    };
  }

  // World navigation & quick actions
  if (/\b(sorprendeme|aleatorio|surprise me)\b/.test(norm)) {
    return {
      spokenReply: lang === 'en' ? 'Opening Surprise Me picks for you!' : lang === 'ca' ? 'Obrint Sorprèn-me!' : lang === 'zh' ? '正在为你打开随机推荐！' : '¡Abriendo Sorpréndeme con una recomendación para ti!',
      intent: 'open_world',
      autoPlay: false,
      action: { type: 'surprise_me' },
      channelKeywords: [],
      categoryHint: '',
      matchKeywords: [],
      tmdbQuery: { mediaType: 'multi', limit: 1 },
    };
  }
  if (/\b(invita amigos|invitar amigos|ver amigos|quien esta conectado|lista de amigos)\b/.test(norm)) {
    return {
      spokenReply: lang === 'en' ? 'Opening your friends list.' : lang === 'ca' ? 'Obrint els teus amics.' : lang === 'zh' ? '正在打开好友列表。' : 'Abriendo tu lista de amigos e invitaciones.',
      intent: 'open_world',
      autoPlay: false,
      action: { type: 'open_friends' },
      channelKeywords: [],
      categoryHint: '',
      matchKeywords: [],
      tmdbQuery: { mediaType: 'multi', limit: 1 },
    };
  }
  const openWorldTrigger = /\b(abre|abrir|ir a|ve a|llevame a|entra en|entra a|open|go to)\b/.test(norm);
  if (openWorldTrigger && /\b(cine|peliculas|catalogo)\b/.test(norm)) {
    return {
      spokenReply: lang === 'en' ? 'Opening the Cinema catalog.' : lang === 'ca' ? 'Obrint el Cinema.' : lang === 'zh' ? '正在打开影院目录。' : 'Abriendo la sección de Cine.',
      intent: 'open_world',
      autoPlay: false,
      action: { type: 'open_world', payload: 'cine' },
      channelKeywords: [],
      categoryHint: '',
      matchKeywords: [],
      tmdbQuery: { mediaType: 'multi', limit: 1 },
    };
  }
  if (openWorldTrigger && /\b(futbol|deportes|sports)\b/.test(norm)) {
    return {
      spokenReply: lang === 'en' ? 'Opening Live Sports.' : lang === 'ca' ? 'Obrint Esports en directe.' : lang === 'zh' ? '正在打开体育直播。' : 'Abriendo la sección de Fútbol y Deportes.',
      intent: 'open_world',
      autoPlay: false,
      action: { type: 'open_world', payload: 'futbol' },
      channelKeywords: [],
      categoryHint: '',
      matchKeywords: [],
      tmdbQuery: { mediaType: 'multi', limit: 1 },
    };
  }
  if (openWorldTrigger && /\b(tv en directo|television|canales|tdt)\b/.test(norm)) {
    return {
      spokenReply: lang === 'en' ? 'Opening Live TV channels.' : lang === 'ca' ? 'Obrint TV en directe.' : lang === 'zh' ? '正在打开电视直播频道。' : 'Abriendo TV en Directo.',
      intent: 'open_world',
      autoPlay: false,
      action: { type: 'open_world', payload: 'tv' },
      channelKeywords: [],
      categoryHint: '',
      matchKeywords: [],
      tmdbQuery: { mediaType: 'multi', limit: 1 },
    };
  }
  if (openWorldTrigger && /\b(juegos|parchis|ajedrez|games)\b/.test(norm)) {
    return {
      spokenReply: lang === 'en' ? 'Opening Party Games.' : lang === 'ca' ? 'Obrint Jocs de sala.' : lang === 'zh' ? '正在打开派对游戏。' : 'Abriendo la zona de Juegos.',
      intent: 'open_world',
      autoPlay: false,
      action: { type: 'open_world', payload: 'juegos' },
      channelKeywords: [],
      categoryHint: '',
      matchKeywords: [],
      tmdbQuery: { mediaType: 'multi', limit: 1 },
    };
  }
  if (openWorldTrigger && /\b(sala|watch party|chat)\b/.test(norm)) {
    return {
      spokenReply: lang === 'en' ? 'Taking you to the Watch Party room.' : lang === 'ca' ? 'Portant-te a la Sala.' : lang === 'zh' ? '正在前往派对房间。' : 'Entrando a la Sala con amigos.',
      intent: 'open_world',
      autoPlay: false,
      action: { type: 'open_world', payload: 'sala' },
      channelKeywords: [],
      categoryHint: '',
      matchKeywords: [],
      tmdbQuery: { mediaType: 'multi', limit: 1 },
    };
  }

  const isWantPlayNow = /\b(quiero ver|pon|ponme|abre|sintoniza|reproduce|en directo|directo|play|watch)\b/.test(norm);

  const epParse = parseSeriesSeasonAndEpisode(query);
  if (epParse.hasEpisodeRequest && epParse.cleanTitle) {
    const season = epParse.season || 1;
    const episode = epParse.episode || 1;
    return {
      spokenReply:
        lang === 'en'
          ? `Playing season ${season}, episode ${episode} of ${epParse.cleanTitle}.`
          : lang === 'ca'
          ? `Posant la temporada ${season}, capítol ${episode} de ${epParse.cleanTitle}.`
          : lang === 'zh'
          ? `正在为你播放《${epParse.cleanTitle}》第 ${season} 季第 ${episode} 集。`
          : `Te pongo el capítulo ${episode} de la temporada ${season} de ${epParse.cleanTitle}.`,
      intent: 'play_series',
      autoPlay: true,
      channelKeywords: [],
      categoryHint: '',
      matchKeywords: [],
      targetSeason: season,
      targetEpisode: episode,
      tmdbQuery: {
        mediaType: 'tv',
        limit: 4,
        titleSearch: epParse.cleanTitle,
      },
    };
  }

  const channelHints = [
    'dazn', 'laliga', 'la liga', 'movistar', 'espn', 'bein', 'sky sports',
    'tnt sports', 'eurovision', 'eurosport', 'nat geo', 'national geographic',
    'discovery', 'history', 'animal planet', 'al jazeera', 'cnn', 'fox',
    'bbc', 'euronews', 'bloomberg', '2m', 'al aoula', 'arriadia', 'marruecos',
    'la 1', 'la 2', 'antena 3', 'cuatro', 'telecinco', 'la sexta', 'tv3', '3cat',
    'cctv', 'migu', 'tdt', 'futbol',
  ];
  const matchedChannelHints = channelHints.filter((k) => norm.includes(k));

  let categoryHint = '';
  if (/marruecos|marroqui|2m|al aoula|arriadia/.test(norm)) categoryHint = 'marruecos';
  else if (/bein|arabe|arabic/.test(norm)) categoryHint = 'bein_arabic';
  else if (/documental|national geographic|nat geo|discovery|history|animal planet/.test(norm)) categoryHint = 'documentales';
  else if (/noticia|al jazeera|cnn|bbc|euronews|bloomberg|dw|france 24/.test(norm)) categoryHint = 'noticias_intl';
  else if (/usa|eeuu|estados unidos|fox|nbc|abc|cbs/.test(norm)) categoryHint = 'usa_tv';
  else if (/europa|rai|rtp|arte|tv5/.test(norm)) categoryHint = 'europa_tv';

  if (matchedChannelHints.length > 0 || categoryHint) {
    const wantsList = !isWantPlayNow || /\b(canales|todos|lista|opciones|cuales)\b/.test(norm);
    return {
      spokenReply:
        lang === 'en'
          ? 'Here is what I found for live TV.'
          : lang === 'ca'
          ? 'Aquí tens el que he trobat en directe.'
          : lang === 'zh'
          ? '这是为你找到的直播电视频道。'
          : 'Aquí tienes los canales en directo que encajan con lo que pides.',
      intent: wantsList ? 'browse_channels' : 'play_channel',
      autoPlay: !wantsList,
      channelKeywords: matchedChannelHints.length ? matchedChannelHints : [norm],
      categoryHint,
      matchKeywords: [],
      tmdbQuery: {
        mediaType: 'multi',
        limit,
      },
    };
  }

  const isScheduleQuestion = /\b(cuando|a que hora|que dia|proximo|siguiente|horario|calendario)\b/.test(norm);
  if (/\b(partido|champions|premier|madrid|barca|barcelona|atletico|sevilla|betis|arsenal|city|liverpool)\b/.test(norm)) {
    return {
      spokenReply: isScheduleQuestion
        ? 'Buscando el horario y canal del próximo partido en la agenda deportiva.'
        : lang === 'en'
        ? 'Checking live football matches for you.'
        : lang === 'ca'
        ? 'Buscant els partits de futbol en directe.'
        : lang === 'zh'
        ? '正在为你查看足球直播赛事。'
        : 'Te muestro los partidos y canales de fútbol disponibles ahora.',
      intent: isScheduleQuestion ? 'sports_info' : 'play_match',
      autoPlay: false,
      channelKeywords: ['dazn', 'movistar', 'bein'],
      categoryHint: '',
      matchKeywords: norm.split(' ').filter((w) => w.length >= 3 && !/cuando|juega|partido|siguiente|proximo|quiero|saber/.test(w)),
      tmdbQuery: { mediaType: 'multi', limit },
    };
  }

  const wantsSeries = /\b(serie|series|anime|temporada|capitulo|episodio)\b/.test(norm);
  const genreHit = GENRE_KEYWORD_MAP.find((g) => g.pattern.test(norm));
  const isThisMonth = /\b(este mes|ultimos dias|reciente|recientes|novedad|estreno|estrenos|hoy|semana)\b/.test(norm);
  const isTopRated = /\b(mejor|mejores|top|buena|buenas|recomend|puntuad)\b/.test(norm);

  if (genreHit || isTopRated || isThisMonth) {
    return {
      spokenReply:
        lang === 'en'
          ? 'Here are the best matches from our catalog.'
          : lang === 'ca'
          ? 'Aquí tens les millors opcions del catàleg.'
          : lang === 'zh'
          ? '这是目录中为你精选的推荐内容。'
          : `Aquí tienes ${limit > 1 ? `las ${limit} mejores opciones` : 'la mejor opción'}${genreHit ? ` de ${genreHit.labelEs}` : ''}${isThisMonth ? ' recientes' : ''}.`,
      intent: wantsSeries ? 'recommend_series' : 'recommend_movies',
      autoPlay: false,
      channelKeywords: [],
      categoryHint: '',
      matchKeywords: [],
      tmdbQuery: {
        mediaType: wantsSeries ? 'tv' : 'movie',
        genreId: genreHit ? (wantsSeries ? genreHit.tvId : genreHit.movieId) : undefined,
        timeframe: isThisMonth ? 'this_month' : 'trending',
        sortBy: isTopRated ? 'top_rated' : 'popular',
        limit,
      },
    };
  }

  // Only treat as title search if explicit media verb/noun is present; otherwise open-domain chat
  const hasExplicitMediaCommand =
    isWantPlayNow ||
    /\b(peli|pelicula|pelis|film|movie|serie|series|anime|busca|buscame|trailer)\b/.test(norm);

  if (!hasExplicitMediaCommand) {
    return {
      spokenReply:
        lang === 'en'
          ? 'I am here! Tell me what you want to talk about or ask me to play any movie, series, live channel, or football match.'
          : lang === 'ca'
          ? 'Aquí em tens! Parlem del que vulguis o demana’m posar qualsevol pel·lícula, sèrie, canal o partit.'
          : lang === 'zh'
          ? '我随时都在！我们可以聊任何话题，或者你也可以让我播放电影、剧集、直播频道或足球比赛。'
          : '¡Aquí estoy! Podemos charlar de lo que quieras o si lo prefieres pídeme una peli, serie, canal en directo o partido.',
      intent: 'chat',
      autoPlay: false,
      channelKeywords: [],
      categoryHint: '',
      matchKeywords: [],
      tmdbQuery: {
        mediaType: 'multi',
        limit: 4,
      },
    };
  }

  const stripped = norm
    .replace(/^(quiero ver|quiero|ponme|pon|busca|buscame|abre|dame|reproduce|ver|una peli de|pelicula|serie)\s+/g, '')
    .trim();

  return {
    spokenReply:
      lang === 'en'
        ? `Searching for ${stripped || query}.`
        : lang === 'ca'
        ? `Cercant ${stripped || query}.`
        : lang === 'zh'
        ? `正在搜索 ${stripped || query}。`
        : `Buscando ${stripped || query} en RiffanTV.`,
    intent: wantsSeries ? 'play_series' : 'play_movie',
    autoPlay: isWantPlayNow && Boolean(stripped),
    channelKeywords: stripped ? stripped.split(' ').filter((w) => w.length >= 2) : [],
    categoryHint: '',
    matchKeywords: [],
    tmdbQuery: {
      mediaType: wantsSeries ? 'tv' : 'multi',
      limit: 5,
      titleSearch: stripped || query.trim(),
    },
  };
}

async function parseIntentWithGemini(
  query: string,
  userName: string,
  lang: string,
  history: VoiceChatHistoryTurn[] = [],
  activeMediaTitle = ''
): Promise<ParsedVoiceIntent> {
  const ai = getGeminiClient();
  if (!ai) {
    return buildFallbackVoicePlan(query, lang);
  }

  const targetLangName =
    lang === 'ca'
      ? 'Catalán'
      : lang === 'en'
      ? 'Inglés'
      : lang === 'zh'
      ? 'Chino mandarín (简体中文)'
      : 'Español de España';

  const trimmedHistory = history
    .slice(-10)
    .map((h) => `${h.role === 'user' ? userName || 'Usuario' : 'RiffanAI'}: ${String(h.text || '').slice(0, 260)}`)
    .join('\n');

  const systemInstruction = `Eres RiffanAI, el compañero conversacional y asistente de voz inteligente de RiffanTV (cine, series, anime, TV TDT e internacional, fútbol en directo, watch party con amigos y juegos).
El usuario se llama "${userName || 'amigo'}". Idioma preferido por defecto: ${targetLangName}.
${activeMediaTitle ? `Contenido reproduciéndose ahora mismo: "${activeMediaTitle}".` : 'No hay contenido reproduciéndose ahora mismo.'}

Tu misión doble es:
A) Mantener una conversación fluida, inteligente, cercana y natural sobre CUALQUIER TEMA que saque el usuario (cultura general, ciencia, cocina, programación, historia, curiosidades, consejos, chistes, debates de cine/fútbol, traducciones o charlar del día a día), recordando el historial reciente de la conversación.
B) Ejecutar acciones inmediatas sobre RiffanTV cuando el usuario quiera ver algo, navegar o controlar el reproductor.

DEVUELVE SIEMPRE SOLO JSON ESTRUCTURADO según las reglas:

1. CONVERSACIÓN GENERAL / PREGUNTAS DE CUALQUIER TEMA (NO es una petición de reproducir ni abrir sección):
   - Ejemplos: "hola cómo estás", "cuéntame una curiosidad del espacio", "explícame qué es un agujero negro", "dame una receta rápida para cenar", "quién ganó el Mundial 2010", "¿de qué va Interstellar y merece la pena?", "ayúdame a practicar inglés", "¿qué opinas del final de Breaking Bad?", preguntas de seguimiento como "¿y por qué pasa eso?" o "cuéntame más".
   - intent: "chat"
   - autoPlay: false
   - spokenReply: Responde de verdad con precisión, calidez, ingenio y claridad en ${targetLangName} (o en el idioma en que te acabe de hablar el usuario si cambia explícitamente). Usa entre 2 y 5 frases naturales y directas para escucharse genial en voz alta, sin listas con asteriscos ni markdown.

2. CONTROL DEL REPRODUCTOR (si pide controlar la reproducción actual):
   - Ejemplos: "pausa", "para el vídeo", "dale al play", "reanuda", "quita el sonido / mute", "pon el sonido", "pantalla completa", "siguiente capítulo / episodio".
   - intent: "player_control"
   - autoPlay: false
   - action: { type: "player_control", payload: "pause" | "play" | "mute" | "unmute" | "fullscreen" | "next_episode" }

3. NAVEGACIÓN / ACCIONES DE LA APP:
   - "abre el cine / vete a series / fútbol / tv / juegos / sala":
     intent: "open_world", action: { type: "open_world", payload: "cine" | "futbol" | "tv" | "juegos" | "sala" }
   - "invitar amigos / ver amigos":
     intent: "open_world", action: { type: "open_friends" }
   - "sorpréndeme" (sin género específico):
     intent: "open_world", action: { type: "surprise_me" }

4. SI PIDE UN CAPÍTULO Y/O TEMPORADA DE UNA SERIE ("ponme el capítulo 3 de la temporada 1 de Nocturno", "cap 2 de Arcane"):
   - intent: "play_series", autoPlay: true, targetSeason, targetEpisode, tmdbQuery: { mediaType: "tv", limit: 4, titleSearch: "<título limpio>" }.

5. SI PREGUNTA CUÁNDO JUEGA UN EQUIPO O HORARIO DE PARTIDO:
   - intent: "sports_info", autoPlay: false, matchKeywords: ["equipo"], channelKeywords: ["dazn", "laliga", "movistar"].

6. SI PIDE UN CANAL DE TV CONCRETO ("ponme dazn laliga", "la 1", "al jazeera", "sky sports"):
   - intent: "play_channel", autoPlay: true, channelKeywords, categoryHint.

7. SI PIDE VER UN PARTIDO EN DIRECTO:
   - intent: "play_match", matchKeywords.

8. SI PIDE RECOMENDACIONES PARA VER ("recomiéndame 3 pelis de terror", "series parecidas a Dark"):
   - intent: "recommend_movies" o "recommend_series", autoPlay: false, tmdbQuery con genreId/titleSearch/timeframe/sortBy/limit.

9. SI PIDE REPRODUCIR UNA PELÍCULA O SERIE CONCRETA ("ponme Interstellar", "quiero ver Deadpool"):
   - intent: "play_movie" o "play_series", autoPlay: true, tmdbQuery.titleSearch: título limpio.`;

  const userPrompt = trimmedHistory
    ? `Historial reciente de la conversación:\n${trimmedHistory}\n\nÚltimo mensaje del usuario: "${query}"`
    : `Mensaje del usuario: "${query}"`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: userPrompt,
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            spokenReply: { type: Type.STRING },
            intent: {
              type: Type.STRING,
              enum: [
                'play_channel',
                'play_match',
                'play_movie',
                'play_series',
                'recommend_movies',
                'recommend_series',
                'browse_channels',
                'sports_info',
                'open_world',
                'player_control',
                'chat',
              ],
            },
            autoPlay: { type: Type.BOOLEAN },
            action: {
              type: Type.OBJECT,
              properties: {
                type: {
                  type: Type.STRING,
                  enum: ['open_world', 'player_control', 'open_friends', 'surprise_me'],
                },
                payload: { type: Type.STRING },
              },
              required: ['type'],
            },
            channelKeywords: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            categoryHint: { type: Type.STRING },
            matchKeywords: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            targetSeason: { type: Type.INTEGER },
            targetEpisode: { type: Type.INTEGER },
            tmdbQuery: {
              type: Type.OBJECT,
              properties: {
                mediaType: { type: Type.STRING, enum: ['movie', 'tv', 'multi'] },
                genreId: { type: Type.INTEGER },
                timeframe: {
                  type: Type.STRING,
                  enum: ['this_month', 'this_year', 'all_time', 'trending'],
                },
                sortBy: {
                  type: Type.STRING,
                  enum: ['top_rated', 'popular', 'newest'],
                },
                limit: { type: Type.INTEGER },
                titleSearch: { type: Type.STRING },
              },
              required: ['mediaType', 'limit'],
            },
          },
          required: ['spokenReply', 'intent', 'autoPlay', 'channelKeywords', 'categoryHint', 'matchKeywords', 'tmdbQuery'],
        },
      },
    });

    const rawText = response.text;
    if (rawText) {
      const parsed = JSON.parse(rawText) as ParsedVoiceIntent;
      const epFallback = parseSeriesSeasonAndEpisode(query);
      const targetSeason = parsed.targetSeason || (epFallback.hasEpisodeRequest ? epFallback.season : undefined);
      const targetEpisode = parsed.targetEpisode || (epFallback.hasEpisodeRequest ? epFallback.episode : undefined);

      return {
        spokenReply: parsed.spokenReply || buildFallbackVoicePlan(query, lang).spokenReply,
        intent: parsed.intent || (epFallback.hasEpisodeRequest ? 'play_series' : 'chat'),
        autoPlay: Boolean(parsed.autoPlay) || epFallback.hasEpisodeRequest,
        action: parsed.action,
        channelKeywords: Array.isArray(parsed.channelKeywords) ? parsed.channelKeywords : [],
        categoryHint: String(parsed.categoryHint || ''),
        matchKeywords: Array.isArray(parsed.matchKeywords) ? parsed.matchKeywords : [],
        targetSeason,
        targetEpisode,
        tmdbQuery: {
          mediaType: parsed.tmdbQuery?.mediaType || (epFallback.hasEpisodeRequest ? 'tv' : 'multi'),
          genreId: parsed.tmdbQuery?.genreId,
          timeframe: parsed.tmdbQuery?.timeframe || 'trending',
          sortBy: parsed.tmdbQuery?.sortBy || 'popular',
          limit: Math.max(1, Math.min(8, Number(parsed.tmdbQuery?.limit) || 4)),
          titleSearch: parsed.tmdbQuery?.titleSearch || epFallback.cleanTitle || '',
        },
      };
    }
  } catch (err) {
    logger.warn({ err, query }, 'voice_assistant_gemini_fallback');
  }

  return buildFallbackVoicePlan(query, lang);
}

export function matchChannelsByKeywords(
  channels: Array<SpanishTdtChannel & { logoUrl?: string }>,
  keywords: string[],
  categoryHint: string,
  limit = 8
): Array<SpanishTdtChannel & { logoUrl?: string }> {
  const normKeywords = keywords
    .map((k) => normalizeSearchStr(k))
    .filter((k) => k.length >= 2);
  const hintNorm = normalizeSearchStr(categoryHint);

  const scored: Array<{ ch: SpanishTdtChannel & { logoUrl?: string }; score: number }> = [];

  for (const ch of channels) {
    const haystack = normalizeSearchStr(
      `${ch.name} ${ch.shortMark || ''} ${ch.network || ''} ${ch.category || ''} ${ch.description || ''}`
    );
    let score = 0;

    if (hintNorm && ch.category) {
      const chCatNorm = normalizeSearchStr(ch.category);
      if (chCatNorm === hintNorm || chCatNorm.includes(hintNorm)) {
        score += 25;
      }
    }

    for (const kw of normKeywords) {
      if (normalizeSearchStr(ch.name) === kw) {
        score += 50;
      } else if (haystack.includes(kw)) {
        score += 15;
      }
    }

    if (score > 0) {
      scored.push({ ch, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.ch);
}

function toCatalogMovieItem(r: TmdbDiscoverResult, fallbackMediaType: 'movie' | 'tv'): CatalogMovie {
  const isTv = (r.media_type || fallbackMediaType) === 'tv';
  const title = (r.title || r.name || r.original_title || r.original_name || 'Sin título').trim();
  const year = (r.release_date || r.first_air_date || '').slice(0, 4);
  const poster = buildTmdbImageUrl(r.poster_path, 'w500') || '';
  const backdrop = buildTmdbImageUrl(r.backdrop_path, 'w780') || '';
  const rating = r.vote_average ? r.vote_average.toFixed(1) : '7.0';

  return {
    id: `tmdb-${isTv ? 'tv' : 'movie'}-${r.id}`,
    title,
    originalTitle: r.original_title || r.original_name || title,
    year,
    rating,
    overview: r.overview || '',
    poster,
    backdrop,
    languages: ['ES', 'LAT', 'VOSE', 'EN'],
    mediaType: isTv ? 'tv' : 'movie',
    tmdbId: r.id,
  };
}

function formatDateYmd(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function resolveTmdbRecommendations(
  tq: ParsedVoiceIntent['tmdbQuery'],
  lang: string
): Promise<CatalogMovie[]> {
  const tmdbLang = resolveTmdbLanguageTag(lang);
  const limit = Math.max(1, Math.min(8, tq.limit || 4));

  if (tq.titleSearch && tq.titleSearch.trim().length >= 2) {
    const cleanSearch = tq.titleSearch.trim();
    const searchEndpoint =
      tq.mediaType === 'tv'
        ? '/search/tv'
        : tq.mediaType === 'movie'
        ? '/search/movie'
        : '/search/multi';

    const searchRes = await fetchTmdbJson<{ results?: TmdbDiscoverResult[] }>(searchEndpoint, {
      query: cleanSearch,
      language: tmdbLang,
      include_adult: false,
      page: 1,
    });

    const results = (searchRes?.results || [])
      .filter((r) => r.media_type !== 'person' && Boolean(r.poster_path || r.backdrop_path))
      .slice(0, limit);

    if (results.length > 0) {
      return results.map((r) => toCatalogMovieItem(r, tq.mediaType === 'tv' ? 'tv' : 'movie'));
    }
  }

  const isTv = tq.mediaType === 'tv';
  const endpoint = isTv ? '/discover/tv' : '/discover/movie';
  const now = new Date();
  const dateGteKey = isTv ? 'first_air_date.gte' : 'primary_release_date.gte';
  const dateLteKey = isTv ? 'first_air_date.lte' : 'primary_release_date.lte';

  let sortParam = 'popularity.desc';
  if (tq.sortBy === 'top_rated') sortParam = 'vote_average.desc';
  else if (tq.sortBy === 'newest') sortParam = isTv ? 'first_air_date.desc' : 'primary_release_date.desc';

  const windowsDays =
    tq.timeframe === 'this_month'
      ? [32, 60, 90]
      : tq.timeframe === 'this_year'
      ? [365]
      : [0];

  for (const daysBack of windowsDays) {
    const params: Record<string, string | number | boolean | undefined> = {
      language: tmdbLang,
      include_adult: false,
      sort_by: sortParam,
      'vote_count.gte': tq.timeframe === 'this_month' ? (daysBack <= 40 ? 8 : 15) : 40,
      page: 1,
    };
    if (tq.genreId) {
      params.with_genres = tq.genreId;
    }
    if (daysBack > 0) {
      const start = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
      params[dateGteKey] = formatDateYmd(start);
      params[dateLteKey] = formatDateYmd(now);
    }

    const res = await fetchTmdbJson<{ results?: TmdbDiscoverResult[] }>(endpoint, params);
    const filtered = (res?.results || []).filter((r) => Boolean(r.poster_path || r.backdrop_path));
    if (filtered.length >= Math.min(limit, 3) || daysBack === windowsDays[windowsDays.length - 1]) {
      return filtered.slice(0, limit).map((r) => toCatalogMovieItem(r, isTv ? 'tv' : 'movie'));
    }
  }

  return [];
}

async function findUpcomingMatchInFotmob(query: string): Promise<{
  match: {
    homeTeam: string;
    awayTeam: string;
    competition: string;
    kickoffTime: string;
    dayLabel: string;
    homeLogo?: string;
    awayLogo?: string;
  };
  spokenReply: string;
} | null> {
  const norm = normalizeSearchStr(query);
  const teamAliases: Array<{ keys: string[]; canonical: string }> = [
    { keys: ['barca', 'barcelona', 'fc barcelona'], canonical: 'FC Barcelona' },
    { keys: ['madrid', 'real madrid'], canonical: 'Real Madrid' },
    { keys: ['atletico', 'atleti', 'atletico de madrid'], canonical: 'Atlético de Madrid' },
    { keys: ['sevilla'], canonical: 'Sevilla FC' },
    { keys: ['betis', 'real betis'], canonical: 'Real Betis' },
    { keys: ['athletic', 'athletic club', 'bilbao'], canonical: 'Athletic Club' },
    { keys: ['girona'], canonical: 'Girona FC' },
    { keys: ['valencia'], canonical: 'Valencia CF' },
    { keys: ['arsenal'], canonical: 'Arsenal' },
    { keys: ['city', 'manchester city'], canonical: 'Manchester City' },
    { keys: ['liverpool'], canonical: 'Liverpool' },
    { keys: ['psg', 'paris'], canonical: 'PSG' },
    { keys: ['bayern'], canonical: 'Bayern Múnich' },
  ];

  const matchedAlias = teamAliases.find((t) => t.keys.some((k) => norm.includes(k)));
  const searchKey = matchedAlias ? matchedAlias.keys[0] : norm;

  for (let offset = 0; offset <= 6; offset += 1) {
    const dk = getMadridDateKey(offset);
    try {
      const dayMatches = await fetchFotmobDayIndex(dk);
      for (const m of dayMatches) {
        const homeNorm = normalizeSearchStr(m.homeName);
        const awayNorm = normalizeSearchStr(m.awayName);
        if (homeNorm.includes(searchKey) || awayNorm.includes(searchKey)) {
          const isHome = homeNorm.includes(searchKey);
          const teamName = matchedAlias ? matchedAlias.canonical : (isHome ? m.homeName : m.awayName);
          const rivalName = isHome ? m.awayName : m.homeName;
          const spoken = `El ${teamName} juega ${offset === 0 ? 'hoy' : offset === 1 ? 'mañana' : `en los próximos días`} a las ${m.kickoffTime}h contra el ${rivalName} en ${m.leagueName}. Podrás seguirlo en directo en DAZN LaLiga y canales deportivos de RiffanTV.`;

          return {
            match: {
              homeTeam: m.homeName,
              awayTeam: m.awayName,
              competition: m.leagueName,
              kickoffTime: m.kickoffTime,
              dayLabel: offset === 0 ? 'hoy' : offset === 1 ? 'mañana' : 'próximamente',
              homeLogo: `https://images.fotmob.com/image_resources/logo/teamlogo/${m.homeId}.png`,
              awayLogo: `https://images.fotmob.com/image_resources/logo/teamlogo/${m.awayId}.png`,
            },
            spokenReply: spoken,
          };
        }
      }
    } catch {
      // continue
    }
  }

  return null;
}

export function registerVoiceAssistantRoutes(app: Express, deps: RegisterVoiceAssistantDeps): void {
  app.post('/api/ai/voice-assistant', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        query?: unknown;
        userName?: unknown;
        lang?: unknown;
        previousItems?: unknown;
        watchHistory?: unknown;
        history?: unknown;
        activeMediaTitle?: unknown;
      };

      const query = String(body.query || '').trim().slice(0, 600);
      const userName = String(body.userName || '').trim().slice(0, 40) || 'amigo';
      const lang = String(body.lang || 'es').toLowerCase().slice(0, 2);
      const previousItems = Array.isArray(body.previousItems)
        ? (body.previousItems as VoiceAssistantCandidateItem[])
        : [];
      const watchHistory = Array.isArray(body.watchHistory)
        ? (body.watchHistory as WatchHistoryItem[])
        : [];
      const history: VoiceChatHistoryTurn[] = Array.isArray(body.history)
        ? body.history
            .filter(
              (h): h is VoiceChatHistoryTurn =>
                Boolean(h) &&
                typeof h === 'object' &&
                (h.role === 'user' || h.role === 'assistant') &&
                typeof h.text === 'string'
            )
            .slice(-10)
        : [];
      const activeMediaTitle = String(body.activeMediaTitle || '').trim().slice(0, 140);

      if (!query) {
        return res.json({
          success: true,
          intent: 'chat',
          autoPlay: false,
          spokenReply:
            lang === 'en'
              ? `Hi ${userName}, how can I help you today?`
              : lang === 'ca'
              ? `Hola ${userName}, com et puc ajudar avui?`
              : lang === 'zh'
              ? `你好 ${userName}，今天有什么我可以帮你的吗？`
              : `Hola ${userName}, ¿qué te apetece hacer o hablar hoy?`,
          items: [],
        });
      }

      const ordinalIdx = detectOrdinalSelection(query);
      if (ordinalIdx !== null && previousItems[ordinalIdx]) {
        const chosen = previousItems[ordinalIdx];
        return res.json({
          success: true,
          intent: 'select_ordinal',
          autoPlay: true,
          spokenReply:
            lang === 'en'
              ? `Playing ${chosen.title} now.`
              : lang === 'ca'
              ? `Posant ${chosen.title} ara mateix.`
              : lang === 'zh'
              ? `正在为你播放 ${chosen.title}。`
              : `Te pongo ${chosen.title} ahora mismo.`,
          items: [chosen],
        });
      }

      const norm = normalizeSearchStr(query);

      const isHistoryResumeRequest =
        /\b(ultima serie|ultimo capitulo|ultima peli|ultima pelicula|continuar|seguir viendo|lo ultimo que estaba viendo|donde lo deje|retomar|la serie que estaba viendo)\b/i.test(
          norm
        );
      if (isHistoryResumeRequest) {
        let matchedHistoryItem: WatchHistoryItem | undefined;
        if (/\b(serie|capitulo)\b/i.test(norm)) {
          matchedHistoryItem = watchHistory.find((h) => h.mediaType === 'tv') || watchHistory[0];
        } else if (/\b(peli|pelicula)\b/i.test(norm)) {
          matchedHistoryItem = watchHistory.find((h) => h.mediaType === 'movie') || watchHistory[0];
        } else {
          matchedHistoryItem = watchHistory[0];
        }

        if (matchedHistoryItem) {
          const epStr =
            matchedHistoryItem.season && matchedHistoryItem.episode
              ? ` (Temporada ${matchedHistoryItem.season}, Capítulo ${matchedHistoryItem.episode})`
              : '';
          const reply =
            lang === 'en'
              ? `Resuming ${matchedHistoryItem.title}${epStr} right where you left off!`
              : lang === 'ca'
              ? `Reprenem ${matchedHistoryItem.title}${epStr} per on anaves!`
              : lang === 'zh'
              ? `正在从你上次看到的地方继续播放 ${matchedHistoryItem.title}！`
              : `¡Retomamos ${matchedHistoryItem.title}${epStr} por donde ibas!`;

          return res.json({
            success: true,
            intent: matchedHistoryItem.mediaType === 'tv' ? 'play_series' : 'play_movie',
            autoPlay: true,
            spokenReply: reply,
            items: [
              {
                kind: matchedHistoryItem.mediaType === 'tv' ? 'series' : 'movie',
                id: matchedHistoryItem.id,
                title: matchedHistoryItem.title,
                subtitle:
                  matchedHistoryItem.subtitle ||
                  (matchedHistoryItem.mediaType === 'tv'
                    ? `Temporada ${matchedHistoryItem.season || 1} · Capítulo ${matchedHistoryItem.episode || 1}`
                    : 'Película'),
                imageUrl: matchedHistoryItem.poster || matchedHistoryItem.backdrop,
                badge: matchedHistoryItem.mediaType === 'tv' ? 'SERIE' : 'CINE',
                targetSeason: matchedHistoryItem.season || 1,
                targetEpisode: matchedHistoryItem.episode || 1,
                media: {
                  id: matchedHistoryItem.id,
                  title: matchedHistoryItem.title,
                  originalTitle: matchedHistoryItem.title,
                  year: matchedHistoryItem.year || '',
                  rating: '8.0',
                  overview: '',
                  poster: matchedHistoryItem.poster || '',
                  backdrop: matchedHistoryItem.backdrop || '',
                  languages: ['ES', 'LAT', 'VOSE', 'EN'],
                  mediaType: matchedHistoryItem.mediaType,
                  tmdbId: matchedHistoryItem.tmdbId,
                  seasonNumber: matchedHistoryItem.season || 1,
                } as CatalogMovie,
              },
            ],
          });
        } else {
          const noHistoryMsg =
            lang === 'en'
              ? `You don't have recent playback history yet. What would you like to watch?`
              : lang === 'ca'
              ? `Encara no tens historial recent. Què et ve de gust començar a veure?`
              : lang === 'zh'
              ? `你还没有最近的观看记录。想看点什么吗？`
              : `Aún no tienes nada en tu historial reciente. Dime qué te apetece ver y te lo pongo al momento.`;
          return res.json({
            success: true,
            intent: 'chat',
            autoPlay: false,
            spokenReply: noHistoryMsg,
            items: [],
          });
        }
      }

      const isScheduleAsk =
        /\b(cuando juega|a que hora juega|que dia juega|proximo partido|siguiente partido|partido del barca|partido del madrid|cuando es el partido)\b/i.test(
          norm
        );
      if (isScheduleAsk || (/\b(cuando|hora|dia)\b/i.test(norm) && /\b(barca|barcelona|madrid|champions|laliga)\b/i.test(norm))) {
        const upcomingFotmob = await findUpcomingMatchInFotmob(query);
        const allChannels = deps.getChannels();
        const footballChannels = matchChannelsByKeywords(allChannels, ['dazn', 'laliga', 'movistar', 'bein'], 'dazn', 3);

        if (upcomingFotmob) {
          const items: VoiceAssistantCandidateItem[] = [
            {
              kind: 'match',
              id: `match-sched-${normalizeSearchStr(upcomingFotmob.match.homeTeam)}`,
              title: `${upcomingFotmob.match.homeTeam} vs ${upcomingFotmob.match.awayTeam}`,
              subtitle: `${upcomingFotmob.match.competition} · ${upcomingFotmob.match.kickoffTime}h`,
              imageUrl: upcomingFotmob.match.homeLogo || upcomingFotmob.match.awayLogo || '',
              badge: 'PRÓXIMO',
              match: {
                id: `sched-${Date.now()}`,
                title: `${upcomingFotmob.match.homeTeam} vs ${upcomingFotmob.match.awayTeam}`,
                competition: upcomingFotmob.match.competition,
                sport: 'soccer',
                time: upcomingFotmob.match.kickoffTime,
                isLive: false,
                channels: [],
                matchMeta: {
                  homeTeam: upcomingFotmob.match.homeTeam,
                  awayTeam: upcomingFotmob.match.awayTeam,
                  homeLogo: upcomingFotmob.match.homeLogo,
                  awayLogo: upcomingFotmob.match.awayLogo,
                  statusLabel: `Hora: ${upcomingFotmob.match.kickoffTime}h`,
                },
              },
            },
          ];

          for (const ch of footballChannels) {
            const logo = ch.logoUrl || deps.resolveLogoUrl(ch) || undefined;
            items.push({
              kind: 'channel',
              id: ch.id,
              title: ch.name,
              subtitle: `${ch.network || 'Fútbol'} · Dial ${ch.dial || '--'}`,
              imageUrl: logo,
              badge: 'CANAL EMISOR',
              channel: { ...ch, logoUrl: logo },
            });
          }

          return res.json({
            success: true,
            intent: 'sports_info',
            autoPlay: false,
            spokenReply: upcomingFotmob.spokenReply,
            items,
          });
        }
      }

      const plan = await parseIntentWithGemini(query, userName, lang, history, activeMediaTitle);

      // Fast path for fluid open-domain conversation & app/player controls
      if (plan.intent === 'open_world' || plan.intent === 'player_control') {
        return res.json({
          success: true,
          intent: plan.intent,
          autoPlay: false,
          action: plan.action,
          spokenReply: plan.spokenReply,
          items: [],
        });
      }

      if (plan.intent === 'chat') {
        return res.json({
          success: true,
          intent: 'chat',
          autoPlay: false,
          spokenReply: plan.spokenReply,
          items: [],
        });
      }

      const allChannels = deps.getChannels();
      const items: VoiceAssistantCandidateItem[] = [];

      if (
        plan.intent === 'play_channel' ||
        plan.intent === 'browse_channels' ||
        plan.channelKeywords.length > 0 ||
        Boolean(plan.categoryHint)
      ) {
        const chMatches = matchChannelsByKeywords(
          allChannels,
          plan.channelKeywords.length ? plan.channelKeywords : [query],
          plan.categoryHint,
          plan.intent === 'browse_channels' ? 10 : 6
        );

        for (const ch of chMatches) {
          const resolvedLogo = ch.logoUrl || deps.resolveLogoUrl(ch) || undefined;
          items.push({
            kind: 'channel',
            id: ch.id,
            title: ch.name,
            subtitle: `${ch.network || 'TV Directo'} · Dial ${ch.dial || '--'}`,
            imageUrl: resolvedLogo,
            badge: ch.quality || 'HD LIVE',
            channel: {
              ...ch,
              logoUrl: resolvedLogo,
            },
          });
        }
      }

      if (plan.intent === 'play_match' || plan.intent === 'sports_info') {
        const matches = await deps.getSportsMatches().catch(() => []);
        const kws = (plan.matchKeywords.length ? plan.matchKeywords : query.split(' '))
          .map((w) => normalizeSearchStr(w))
          .filter((w) => w.length >= 3);

        const matchedGames = matches
          .filter((m) => {
            const hay = normalizeSearchStr(
              `${m.title} ${m.competition || ''} ${m.matchMeta?.homeTeam || ''} ${m.matchMeta?.awayTeam || ''}`
            );
            return kws.length === 0 || kws.some((k) => hay.includes(k));
          })
          .slice(0, 6);

        for (const m of matchedGames) {
          items.push({
            kind: 'match',
            id: m.id,
            title: m.title,
            subtitle: `${m.competition || 'Fútbol'} · ${m.matchMeta?.statusLabel || m.time || 'En Directo'}`,
            imageUrl: m.matchMeta?.homeLogo || m.matchMeta?.awayLogo || '',
            badge: m.isLive ? 'EN VIVO' : m.matchMeta?.statusLabel || 'PRÓXIMO',
            match: m,
          });
        }

        if (plan.intent === 'sports_info' && items.length === 0) {
          const footballChannels = matchChannelsByKeywords(allChannels, ['dazn', 'laliga', 'movistar', 'bein'], 'dazn', 3);
          for (const ch of footballChannels) {
            const logo = ch.logoUrl || deps.resolveLogoUrl(ch) || undefined;
            items.push({
              kind: 'channel',
              id: ch.id,
              title: ch.name,
              subtitle: `${ch.network || 'Fútbol'} · Dial ${ch.dial || '--'}`,
              imageUrl: logo,
              badge: 'CANAL DEPORTES',
              channel: { ...ch, logoUrl: logo },
            });
          }
        }
      }

      if (
        plan.intent === 'recommend_movies' ||
        plan.intent === 'recommend_series' ||
        plan.intent === 'play_movie' ||
        plan.intent === 'play_series'
      ) {
        const tmdbItems = await resolveTmdbRecommendations(plan.tmdbQuery, lang);
        for (const m of tmdbItems) {
          const isTv = m.mediaType === 'tv';
          const epInfo =
            plan.targetSeason && plan.targetEpisode
              ? `Temporada ${plan.targetSeason} · Capítulo ${plan.targetEpisode}`
              : isTv
              ? 'Serie'
              : 'Película';

          items.push({
            kind: isTv ? 'series' : 'movie',
            id: m.id,
            title: m.title,
            subtitle: `${epInfo} · ${m.year || 'HD'} · ★ ${m.rating || '7.5'}`,
            imageUrl: m.poster || m.backdrop || '',
            badge: isTv ? 'SERIE' : 'CINE',
            targetSeason: plan.targetSeason,
            targetEpisode: plan.targetEpisode,
            media: {
              ...m,
              seasonNumber: plan.targetSeason,
            },
          });
        }
      }

      const shouldAutoPlay =
        Boolean(plan.autoPlay) &&
        items.length > 0 &&
        (plan.intent === 'play_channel' ||
          plan.intent === 'play_movie' ||
          plan.intent === 'play_series' ||
          plan.intent === 'play_match');

      let finalReply = plan.spokenReply;

      if (items.length === 0 && (!finalReply || finalReply.startsWith('Searching') || finalReply.startsWith('Buscando'))) {
        finalReply =
          lang === 'en'
            ? `Sorry ${userName}, I could not find anything matching "${query}". Try asking for a channel like DAZN LaLiga, a sports fixture, or ask me anything else.`
            : lang === 'ca'
            ? `Ho sento ${userName}, no he trobat res per a "${query}". Prova demanant un canal com DAZN LaLiga, un partit o pregunta’m qualsevol cosa.`
            : lang === 'zh'
            ? `抱歉 ${userName}，我没有找到匹配“${query}”的内容。你可以试试点播电影、直播频道，或者和我聊任何话题。`
            : `No encontré nada exacto para "${query}", ${userName}. Prueba pidiendo un canal como DAZN LaLiga, una película o pregúntame lo que quieras.`;
      } else if (shouldAutoPlay && items.length > 0) {
        if (plan.targetEpisode) {
          finalReply = `¡Marchando! Te pongo el capítulo ${plan.targetEpisode} de la temporada ${plan.targetSeason || 1} de ${items[0].title}.`;
        } else {
          finalReply =
            lang === 'en'
              ? `Tuning ${items[0].title} right now.`
              : lang === 'ca'
              ? `Posant ${items[0].title} ara mateix.`
              : lang === 'zh'
              ? `马上为你播放 ${items[0].title}。`
              : `¡Marchando! Te pongo ${items[0].title}.`;
        }
      }

      return res.json({
        success: true,
        intent: plan.intent,
        autoPlay: shouldAutoPlay,
        action: plan.action,
        spokenReply: finalReply,
        items,
      });
    } catch (err) {
      logger.error({ err }, 'voice_assistant_route_error');
      return res.status(500).json({
        success: false,
        intent: 'chat',
        autoPlay: false,
        spokenReply: 'Vaya, ha fallado un momento el asistente de voz. Inténtalo de nuevo.',
        items: [],
      });
    }
  });

  // High-accuracy server-side audio transcription via Gemini (works in all browsers & iframes)
  app.post('/api/ai/transcribe', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        audioBase64?: unknown;
        mimeType?: unknown;
        lang?: unknown;
      };
      const rawAudio = String(body.audioBase64 || '').trim();
      if (!rawAudio) {
        return res.status(400).json({ success: false, transcript: '', error: 'Missing audioBase64' });
      }
      const cleanBase64 = rawAudio.replace(/^data:[^;]+;base64,/, '');
      const mimeType = String(body.mimeType || 'audio/webm').split(';')[0].trim() || 'audio/webm';
      const lang = String(body.lang || 'es').toLowerCase().slice(0, 2);

      const ai = getGeminiClient();
      if (!ai) {
        return res.json({ success: false, transcript: '', reason: 'no_api_key' });
      }

      const hintLang =
        lang === 'en'
          ? 'English'
          : lang === 'ca'
          ? 'Catalan or Spanish'
          : lang === 'zh'
          ? 'Mandarin Chinese'
          : 'Spanish';

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Transcribe the spoken audio accurately in the language spoken (default hint: ${hintLang}). Return ONLY the plain spoken words with natural punctuation and no quotes, labels, or explanations. If the audio is silent or unintelligible, return an empty string.`,
              },
              {
                inlineData: {
                  mimeType,
                  data: cleanBase64,
                },
              },
            ],
          },
        ],
      });

      const transcript = String(response.text || '').trim().replace(/^["'“”]+|["'“”]+$/g, '');
      return res.json({
        success: Boolean(transcript),
        transcript,
      });
    } catch (err) {
      logger.warn({ err }, 'voice_transcribe_error');
      return res.json({ success: false, transcript: '', reason: 'transcribe_failed' });
    }
  });

  // Natural neural Text-to-Speech via Gemini TTS (returns base64 24kHz WAV binary)
  app.post('/api/ai/tts', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        text?: unknown;
        lang?: unknown;
        voiceName?: unknown;
      };
      const rawText = String(body.text || '')
        .replace(/[*_`#>]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 600);
      if (!rawText) {
        return res.status(400).json({ success: false, error: 'Missing text' });
      }
      const lang = String(body.lang || 'es').toLowerCase().slice(0, 2);
      const voiceName = String(
        body.voiceName ||
          (lang === 'en' ? 'Kore' : 'Zephyr')
      ).trim();

      const ai = getGeminiClient();
      if (!ai) {
        return res.json({ success: false, reason: 'no_api_key' });
      }

      const synthesizeWithModel = async (modelId: string) => {
        const response = await ai.models.generateContent({
          model: modelId,
          contents: [
            {
              role: 'user',
              parts: [{ text: rawText }],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName,
                },
              },
            },
          },
        });
        const parts = response.candidates?.[0]?.content?.parts || [];
        const audioPart = parts.find((p) => Boolean(p?.inlineData?.data));
        return {
          base64Audio: audioPart?.inlineData?.data || '',
          mimeType: audioPart?.inlineData?.mimeType || 'audio/wav',
        };
      };

      let synthesized = { base64Audio: '', mimeType: 'audio/wav' };
      try {
        synthesized = await synthesizeWithModel('gemini-3.8-flash-lite-tts');
      } catch (firstErr) {
        logger.debug({ firstErr }, 'tts_primary_model_retry');
        synthesized = await synthesizeWithModel('gemini-2.5-flash-preview-tts');
      }

      if (!synthesized.base64Audio) {
        return res.json({ success: false, reason: 'empty_audio' });
      }

      return res.json({
        success: true,
        audioBase64: synthesized.base64Audio,
        mimeType: synthesized.mimeType,
      });
    } catch (err) {
      logger.warn({ err }, 'voice_tts_error');
      return res.json({ success: false, reason: 'tts_failed' });
    }
  });
}
