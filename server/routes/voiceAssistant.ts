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
  | 'chat';

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

  const isWantPlayNow = /\b(quiero ver|pon|ponme|abre|sintoniza|reproduce|en directo|directo)\b/.test(norm);

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

  const stripped = norm
    .replace(/^(quiero ver|quiero|ponme|pon|busca|buscame|abre|dame|reproduce|ver|una peli de|pelicula|serie)\s+/g, '')
    .trim();

  return {
    spokenReply:
      lang === 'en'
        ? `Searching for ${stripped || query}.`
        : lang === 'ca'
        ? `Cercant ${stripped || query}.`
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
  lang: string
): Promise<ParsedVoiceIntent> {
  const ai = getGeminiClient();
  if (!ai) {
    return buildFallbackVoicePlan(query, lang);
  }

  const targetLangName =
    lang === 'ca' ? 'Catalán' : lang === 'en' ? 'Inglés' : 'Español de España';

  const systemInstruction = `Eres el asistente de voz de RiffanTV (plataforma de cine, series, anime, TDT, fútbol mundial en directo Champions/LaLiga/Premier, canales internacionales y watch party).
El usuario se llama "${userName || 'amigo'}" y ha dicho/escrito: "${query}".

Interpreta su intención y devuelve SOLO JSON estructurado cumpliendo estas reglas estrictas:

1. SI PIDE UN CAPÍTULO Y/O TEMPORADA DE UNA SERIE (ej: "quiero ver el capítulo 3 de la primera temporada de Nocturno", "nocturno temp 1 cap 3", "episodio 5 temporada 2 de breaking bad"):
   - intent: "play_series"
   - autoPlay: true
   - targetSeason: número entero de la temporada pedida (ej. 1 para "primera temporada")
   - targetEpisode: número entero del capítulo pedido (ej. 3 para "capítulo 3")
   - tmdbQuery.titleSearch: SOLO el título limpio de la serie (ej: "Nocturno"), NUNCA incluyas "capítulo", "temporada", ni "quiero ver".
   - tmdbQuery.mediaType: "tv"
   - spokenReply: "Te pongo el capítulo 3 de la temporada 1 de Nocturno." (ajustado al título y números exactos en ${targetLangName}).

2. SI PREGUNTA CUÁNDO JUEGA UN EQUIPO O EL HORARIO DE UN PARTIDO (ej: "quiero saber cuándo juega el Barça el siguiente partido", "¿a qué hora juega el Madrid?", "¿cuándo es la Champions?"):
   - intent: "sports_info"
   - autoPlay: false
   - matchKeywords: nombres del equipo o competición limpia (ej: ["barca", "barcelona"] o ["real madrid"]).
   - channelKeywords: ["dazn", "laliga", "movistar"]
   - spokenReply: Responde directamente y con amabilidad con el partido próximo del equipo y dónde verlo.

3. SI PIDE UN CANAL CONCRETO ("quiero ver dazn la liga", "ponme la 1", "al jazeera", "national geographic", "fox", "bein sports 1", "tv3"):
   - intent: "play_channel"
   - autoPlay: true
   - channelKeywords: palabras clave del canal.
   - categoryHint: "bein_arabic", "marruecos", "documentales", "usa_tv", "europa_tv", "noticias_intl", "movistar", "dazn", "uk_sports", "china_football", o "".

4. SI PIDE VER UN PARTIDO EN DIRECTO ("ver el partido del madrid", "partido de champions"):
   - intent: "play_match"
   - matchKeywords: nombres de equipo/competición.

5. SI PIDE RECOMENDACIONES ("las mejores 3 pelis de terror de este mes", "5 series de ciencia ficción top"):
   - intent: "recommend_movies" o "recommend_series"
   - autoPlay: false
   - tmdbQuery.mediaType: "movie" o "tv"
   - tmdbQuery.genreId: ID TMDB estándar (Terror=27, Comedia=35, Acción=28, Ciencia ficción=878, Suspense=53, Drama=18, Animación=16, Romance=10749, Documental=99; para TV: Sci-Fi=10765, Action=10759, Misterio=9648)
   - tmdbQuery.timeframe: "this_month" | "this_year" | "trending" | "all_time"
   - tmdbQuery.sortBy: "top_rated" | "popular" | "newest"
   - tmdbQuery.limit: número exacto pedido (1 a 8).

6. SI PIDE UNA PELÍCULA O SERIE SIN NÚMERO DE CAPÍTULO ("ponme origen", "ver interstellar"):
   - intent: "play_movie" o "play_series"
   - autoPlay: true
   - tmdbQuery.titleSearch: título limpio.

7. spokenReply: siempre natural, cercana, en ${targetLangName}, tuteando con respeto y resolviendo la duda.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Petición del usuario: "${query}"`,
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
                'chat',
              ],
            },
            autoPlay: { type: Type.BOOLEAN },
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
      };

      const query = String(body.query || '').trim().slice(0, 280);
      const userName = String(body.userName || '').trim().slice(0, 40) || 'amigo';
      const lang = String(body.lang || 'es').toLowerCase().slice(0, 2);
      const previousItems = Array.isArray(body.previousItems)
        ? (body.previousItems as VoiceAssistantCandidateItem[])
        : [];
      const watchHistory = Array.isArray(body.watchHistory)
        ? (body.watchHistory as WatchHistoryItem[])
        : [];

      if (!query) {
        return res.json({
          success: true,
          intent: 'chat',
          autoPlay: false,
          spokenReply:
            lang === 'en'
              ? `Hi, ${userName}, what do you want to watch today?`
              : lang === 'ca'
              ? `Hola, ${userName}, què vols veure avui?`
              : `Hola, ${userName}, ¿qué quieres ver hoy?`,
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

      const plan = await parseIntentWithGemini(query, userName, lang);
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
        plan.intent === 'play_series' ||
        (items.length === 0 && plan.intent === 'chat')
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
            ? `Sorry ${userName}, I could not find anything matching "${query}". Try asking for a channel like DAZN LaLiga, a sports fixture, or a movie genre.`
            : lang === 'ca'
            ? `Ho sento ${userName}, no he trobat res per a "${query}". Prova demanant un canal com DAZN LaLiga, un partit o un gènere de cinema.`
            : `No encontré nada exacto para "${query}", ${userName}. Prueba pidiendo un canal como DAZN LaLiga o pelis de algún género.`;
      } else if (shouldAutoPlay && items.length > 0) {
        if (plan.targetEpisode) {
          finalReply = `¡Marchando! Te pongo el capítulo ${plan.targetEpisode} de la temporada ${plan.targetSeason || 1} de ${items[0].title}.`;
        } else {
          finalReply =
            lang === 'en'
              ? `Tuning ${items[0].title} right now.`
              : lang === 'ca'
              ? `Posant ${items[0].title} ara mateix.`
              : `¡Marchando! Te pongo ${items[0].title}.`;
        }
      }

      return res.json({
        success: true,
        intent: plan.intent,
        autoPlay: shouldAutoPlay,
        spokenReply: finalReply,
        items,
      });
    } catch (err) {
      logger.error({ err }, 'voice_assistant_route_error');
      return res.status(500).json({
        success: false,
        intent: 'chat',
        autoPlay: false,
        spokenReply: 'Vaya, ha fallado la búsqueda por voz. Inténtalo de nuevo.',
        items: [],
      });
    }
  });
}
