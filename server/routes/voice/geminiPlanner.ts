import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { logger } from '../../utils/logger.ts';
import { parseGeminiJson } from '../aiStudio/shared.ts';
import type { ParsedVoiceIntent, VoiceChatHistoryTurn } from './types.ts';
import { parseSeriesSeasonAndEpisode } from './parsers.ts';
import { buildFallbackVoicePlan } from './fallbackPlanner.ts';

export function getGeminiClient(): GoogleGenAI | null {
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

export async function parseIntentWithGemini(
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
   - "abre el cine / vete a series / fútbol / tv / música / juegos / sala":
     intent: "open_world", action: { type: "open_world", payload: "cine" | "futbol" | "tv" | "musica" | "juegos" | "sala" }
   - "invitar amigos / ver amigos":
     intent: "open_world", action: { type: "open_friends" }
   - "sorpréndeme" (sin género específico):
     intent: "open_world", action: { type: "surprise_me" }

4. SI PIDE ESCUCHAR UNA CANCIÓN, ARTISTA O ÁLBUM EN RIFFAN MUSIC ("pon la canción X", "pon música de Bad Bunny"):
   - intent: "play_music", autoPlay: false, tmdbQuery: { mediaType: "multi", limit: 5, titleSearch: "<artista o canción>" }.

5. SI PIDE UN CAPÍTULO Y/O TEMPORADA DE UNA SERIE ("ponle el segundo capítulo de la temporada 2 de Juego de Tronos", "pon el 2x03 de Breaking Bad"):
   - intent: "play_series", autoPlay: false, targetSeason: 2, targetEpisode: 2, tmdbQuery: { mediaType: "tv", limit: 4, titleSearch: "Juego de Tronos" }.
   - spokenReply: Responde cordialmente informando que le muestras el capítulo exacto para que pulse reproducir cuando quiera.

6. SI PIDE PELÍCULAS O SERIES DE UN DIRECTOR O ACTOR ("dime las películas de Christopher Nolan", "qué películas tiene Leonardo DiCaprio", "dime las pelis de este actor"):
   - intent: "recommend_movies" (o "recommend_series" si pide series), autoPlay: false.
   - tmdbQuery: { mediaType: "movie", limit: 8, personSearch: "<Nombre exacto de la persona>", personRole: "director" | "actor" | "any" }.
   - spokenReply: Breve introducción natural enumerando brevemente 2 o 3 títulos suyos icónicos mientras mostramos la lista visual lista para reproducir.

7. SI PREGUNTA CUÁNDO JUEGA UN EQUIPO O HORARIO DE PARTIDO:
   - intent: "sports_info", autoPlay: false, matchKeywords: ["equipo"], channelKeywords: ["dazn", "laliga", "movistar"].

8. SOLO SI PIDE EXPRESAMENTE UN CANAL DE TV EN DIRECTO ("ponme DAZN LaLiga", "pon La 1", "quiero ver Antena 3"):
   - intent: "play_channel", autoPlay: false, channelKeywords, categoryHint.
   - ¡PROHIBIDO elegir play_channel o browse_channels si el usuario pide una película, serie, actor o director!

9. SI PIDE VER UN PARTIDO EN DIRECTO:
   - intent: "play_match", autoPlay: false, matchKeywords.

10. SI PIDE RECOMENDACIONES POR GÉNERO O DESCRIPCIÓN ("recomiéndame alguna película", "recomiéndame 3 pelis de terror", "pelis donde el tiempo es dinero"):
   - Para peticiones de recomendación ("recomiéndame alguna película", "qué puedo ver", "sugiéreme algo"), habla con naturalidad y calidez humana (p.ej. "¡Por supuesto! Aquí tienes una selección de películas muy recomendadas de nuestro catálogo:") y JAMÁS repitas textualmente las palabras del usuario como "Aquí tienes recomiendame...".
   - Si describe una película concreta por su argumento (p.ej. "la peli donde pagan con tiempo"), identifica el título exacto en titleSearch (p.ej. "In Time") y usa play_movie / recommend_movies con autoPlay: false.
   - Si pide género o ranking, usa recommend_movies / recommend_series con genreId / timeframe / sortBy / limit y autoPlay: false.

11. SI PIDE REPRODUCIR UNA PELÍCULA O SERIE CONCRETA ("ponle la película In Time", "ponme Interstellar", "quiero ver Deadpool"):
    - intent: "play_movie" o "play_series", autoPlay: false, channelKeywords: [], categoryHint: "", tmdbQuery: { mediaType: "movie" | "tv", limit: 4, titleSearch: "<Título limpio exacto, p.ej. In Time>" }.
    - REGLA ABSOLUTA: NUNCA pongas autoPlay en true. Muestra siempre las opciones para que el usuario elija y pulse con un clic.`;

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
                'play_music',
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
                personSearch: { type: Type.STRING },
                personRole: { type: Type.STRING, enum: ['director', 'actor', 'any'] },
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
      const parsed = parseGeminiJson<Partial<ParsedVoiceIntent>>(rawText, {});
      if (!parsed || typeof parsed !== 'object' || !parsed.intent) {
        return buildFallbackVoicePlan(query, lang);
      }
      const epFallback = parseSeriesSeasonAndEpisode(query);
      const targetSeason = parsed.targetSeason || (epFallback.hasEpisodeRequest ? epFallback.season : undefined);
      const targetEpisode = parsed.targetEpisode || (epFallback.hasEpisodeRequest ? epFallback.episode : undefined);
      const cleanIntent =
        epFallback.hasEpisodeRequest && parsed.intent === 'chat'
          ? 'play_series'
          : parsed.intent || (epFallback.hasEpisodeRequest ? 'play_series' : 'chat');
      const isMediaNonChannel =
        cleanIntent === 'play_movie' ||
        cleanIntent === 'play_series' ||
        cleanIntent === 'recommend_movies' ||
        cleanIntent === 'recommend_series';

      return {
        spokenReply: parsed.spokenReply || buildFallbackVoicePlan(query, lang).spokenReply,
        intent: cleanIntent,
        autoPlay: false,
        action: parsed.action,
        channelKeywords: isMediaNonChannel
          ? []
          : Array.isArray(parsed.channelKeywords)
          ? parsed.channelKeywords
          : [],
        categoryHint: isMediaNonChannel ? '' : String(parsed.categoryHint || ''),
        matchKeywords: Array.isArray(parsed.matchKeywords) ? parsed.matchKeywords : [],
        targetSeason,
        targetEpisode,
        tmdbQuery: {
          mediaType: parsed.tmdbQuery?.mediaType || (epFallback.hasEpisodeRequest ? 'tv' : 'multi'),
          genreId: parsed.tmdbQuery?.genreId,
          timeframe: parsed.tmdbQuery?.timeframe || 'trending',
          sortBy: parsed.tmdbQuery?.sortBy || 'popular',
          limit: Math.max(1, Math.min(8, Number(parsed.tmdbQuery?.limit) || (parsed.tmdbQuery?.personSearch ? 8 : 4))),
          titleSearch: parsed.tmdbQuery?.titleSearch || epFallback.cleanTitle || '',
          personSearch: parsed.tmdbQuery?.personSearch ? String(parsed.tmdbQuery.personSearch).trim() : undefined,
          personRole: parsed.tmdbQuery?.personRole || 'any',
        },
      };
    }
  } catch (err) {
    logger.warn({ err, query }, 'voice_assistant_gemini_fallback');
  }

  return buildFallbackVoicePlan(query, lang);
}
