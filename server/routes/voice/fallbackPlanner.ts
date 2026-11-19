import type { ParsedVoiceIntent } from './types.ts';
import { normalizeSearchStr, parseSeriesSeasonAndEpisode } from './parsers.ts';

export const GENRE_KEYWORD_MAP: Array<{ pattern: RegExp; movieId: number; tvId: number; labelEs: string }> = [
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

  const isWantPlayNow = /\b(quiero ver|ponme|ponle|pon|ponnos|abre|sintoniza|reproduce|en directo|play|watch)\b/.test(norm);
  const mentionsMovieOrSeries = /\b(peli|pelicula|peliculas|pelis|film|movie|movies|serie|series|anime|temporada|capitulo|cap|episodio|director|dirigid[ao]s?|actor|actriz|protagonizad[ao]s?|filmografia)\b/.test(norm);

  const epParse = parseSeriesSeasonAndEpisode(query);
  if (epParse.hasEpisodeRequest && epParse.cleanTitle) {
    const season = epParse.season || 1;
    const episode = epParse.episode || 1;
    const displayTitle = epParse.cleanTitle.replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      spokenReply:
        lang === 'en'
          ? `Here is season ${season}, episode ${episode} of ${displayTitle}. Tap to play.`
          : lang === 'ca'
          ? `Aquí tens la temporada ${season}, capítol ${episode} de ${displayTitle}. Prem per reproduir-lo.`
          : lang === 'zh'
          ? `这是《${displayTitle}》第 ${season} 季第 ${episode} 集，点击播放。`
          : `Aquí tienes el capítulo ${episode} de la temporada ${season} de ${displayTitle}. Haz clic para reproducirlo.`,
      intent: 'play_series',
      autoPlay: isWantPlayNow,
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

  // Director / Actor filmography requests must be checked BEFORE channels or generic genre hints
  const directorTrigger = /\b(director|directora|dirigid[ao]s?\s+por|ha dirigido)\b/.test(norm);
  const actorTrigger = /\b(actor|actriz|protagonizad[ao]s?\s+por|actua|sale|aparece)\b/.test(norm);
  const personMatch =
    norm.match(/\b(?:dime|muestrame|ensename|busca|cuales son|ver|ponme|quiero ver)?\s*(?:las\s+|todas las\s+)?(?:peliculas|pelis|obras|filmografia|series)\s+(?:del director|de la directora|dirigidas?\s+por|protagonizadas?\s+por|del actor|de la actriz|de|del|con)\s+([a-zA-Z0-9\s]+)/i) ||
    norm.match(/\b(?:que|cuales)\s+(?:peliculas|pelis)\s+(?:ha hecho|ha dirigido|hizo|dirigio|tiene)\s+([a-zA-Z0-9\s]+)/i);

  if (personMatch && !/\b(terror|miedo|accion|comedia|ciencia ficcion|drama|suspense|thriller|animacion|romance|documental|este mes|este ano)\b/i.test(personMatch[1])) {
    const rawPerson = personMatch[1]
      .replace(/\b(?:peliculas|pelis|series|que|ha|hecho|dirigido|protagonizado|y|me|aparezcan|salgan|por favor|directo|cine)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (rawPerson.length >= 2) {
      const personRole: 'director' | 'actor' | 'any' = directorTrigger
        ? 'director'
        : actorTrigger
        ? 'actor'
        : 'any';
      return {
        spokenReply:
          lang === 'en'
            ? `Here are the top movies for ${rawPerson}:`
            : lang === 'ca'
            ? `Aquí tens les pel·lícules més destacades de ${rawPerson}:`
            : lang === 'zh'
            ? `这是为你找到的 ${rawPerson} 代表作品：`
            : `Aquí tienes las películas más destacadas de ${rawPerson}:`,
        intent: 'recommend_movies',
        autoPlay: false,
        channelKeywords: [],
        categoryHint: '',
        matchKeywords: [],
        tmdbQuery: {
          mediaType: 'movie',
          limit: 8,
          personSearch: rawPerson,
          personRole,
        },
      };
    }
  }

  // Only match TV channels when user did NOT ask for movies/series/actors/directors, using strict word boundaries
  const strictChannelHints = [
    'dazn', 'laliga', 'la liga', 'movistar', 'espn', 'bein', 'sky sports',
    'tnt sports', 'eurovision', 'eurosport', 'nat geo', 'national geographic',
    'discovery', 'history channel', 'animal planet', 'al jazeera', 'cnn', 'fox news', 'fox sports',
    'bbc', 'euronews', 'bloomberg', '2m', 'al aoula', 'arriadia', 'marruecos',
    'la 1', 'la 2', 'antena 3', 'cuatro', 'telecinco', 'la sexta', 'tv3', '3cat',
    'cctv', 'migu', 'tdt', 'telediario', 'canal',
  ];
  const matchedChannelHints = !mentionsMovieOrSeries
    ? strictChannelHints.filter((k) => {
        const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`, 'i').test(norm);
      })
    : [];

  let categoryHint = '';
  if (!mentionsMovieOrSeries) {
    if (/\b(marruecos|marroqui|2m|al aoula|arriadia)\b/.test(norm)) categoryHint = 'marruecos';
    else if (/\b(bein|arabe|arabic)\b/.test(norm)) categoryHint = 'bein_arabic';
    else if (/\b(national geographic|nat geo|discovery|animal planet)\b/.test(norm)) categoryHint = 'documentales';
    else if (/\b(noticias|al jazeera|cnn|bbc|euronews|bloomberg|france 24)\b/.test(norm)) categoryHint = 'noticias_intl';
  }

  if (!mentionsMovieOrSeries && (matchedChannelHints.length > 0 || categoryHint)) {
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
  if (!mentionsMovieOrSeries && /\b(partido|champions|premier|real madrid|barca|barcelona|atletico|sevilla|betis|arsenal|manchester city|liverpool|futbol)\b/.test(norm)) {
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
  const isRecommendation =
    /\b(recomiend[a-z]*|comiend[a-z]*|sugier[a-z]*|sugerencia[a-z]*|que ver|que me recomiendas|consejo|dame algo|ponme algo|que hay de bueno)\b/i.test(norm) ||
    /\b(mejor|mejores|top|buena|buenas|destacad[ao]s?|puntuad[ao]s?)\b/i.test(norm);
  const genreHit = GENRE_KEYWORD_MAP.find((g) => g.pattern.test(norm));
  const isThisMonth = /\b(este mes|ultimos dias|reciente|recientes|novedad|estreno|estrenos|hoy|semana)\b/.test(norm);

  if (isRecommendation || genreHit || isThisMonth) {
    let replyEs = '¡Claro! Aquí te recomiendo algunas de las mejores películas destacadas de nuestro catálogo:';
    if (genreHit) {
      replyEs = `¡Claro! Aquí tienes una selección recomendada de ${genreHit.labelEs}:`;
    } else if (wantsSeries) {
      replyEs = '¡Claro! Aquí te recomiendo algunas de las series más destacadas:';
    }

    return {
      spokenReply:
        lang === 'en'
          ? 'Here are top recommendations from our catalog:'
          : lang === 'ca'
          ? 'Aquí tens una selecció recomanada del catàleg:'
          : lang === 'zh'
          ? '这是目录中为你精选的推荐内容：'
          : replyEs,
      intent: wantsSeries ? 'recommend_series' : 'recommend_movies',
      autoPlay: false,
      channelKeywords: [],
      categoryHint: '',
      matchKeywords: [],
      tmdbQuery: {
        mediaType: wantsSeries ? 'tv' : 'movie',
        genreId: genreHit ? (wantsSeries ? genreHit.tvId : genreHit.movieId) : undefined,
        timeframe: isThisMonth ? 'this_month' : 'trending',
        sortBy: 'top_rated',
        limit: limitMatch ? limit : 5,
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
    .replace(/^(?:quiero ver|quiero|ponme|ponle|pon|ponnos|busca|buscame|abre|dame|reproduce|ver)\s+/g, '')
    .replace(/^(?:una\s+)?(?:pelicula|peli|serie|la pelicula|la peli|la serie|el film|movie|film)\s+(?:llamada\s+|titulada\s+|de\s+)?/g, '')
    .replace(/^(?:la\s+|el\s+)(?=(?:pelicula|peli|serie))/g, '')
    .trim();

  const wantsSpecificMovie = /\b(peli|pelicula|film|movie)\b/.test(norm);
  const effectiveTitle = stripped || query.trim();
  const displayTitle = effectiveTitle.replace(/\b\w/g, (c) => c.toUpperCase());

  return {
    spokenReply:
      lang === 'en'
        ? `Here is ${displayTitle}. Tap play whenever you are ready.`
        : lang === 'ca'
        ? `Aquí tens ${displayTitle}. Prem per reproduir quan vulguis.`
        : lang === 'zh'
        ? `这是为你找到的《${displayTitle}》，点击即可播放。`
        : `Aquí tienes ${displayTitle}. Pulsa reproducir para verla cuando quieras.`,
    intent: wantsSeries ? 'play_series' : 'play_movie',
    autoPlay: false,
    channelKeywords: [],
    categoryHint: '',
    matchKeywords: [],
    tmdbQuery: {
      mediaType: wantsSeries ? 'tv' : wantsSpecificMovie ? 'movie' : 'multi',
      limit: 5,
      titleSearch: effectiveTitle,
    },
  };
}
