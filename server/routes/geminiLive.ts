import type { IncomingMessage, Server as HttpServer } from 'http';
import type { Duplex } from 'stream';
import {
  GoogleGenAI,
  Modality,
  Type,
  type FunctionDeclaration,
  type LiveServerMessage,
} from '@google/genai';
import { WebSocketServer, WebSocket } from 'ws';
import type { SpanishTdtChannel, SportsMatch } from '../../src/types.ts';
import { buildTmdbImageUrl, fetchTmdbJson, resolveTmdbLanguageTag } from '../services/tmdbService.ts';
import { matchChannelsByKeywords, parseSeriesSeasonAndEpisode } from './voiceAssistant.ts';
import { logger } from '../utils/logger.ts';

export interface GeminiLiveDeps {
  getChannels: () => Array<SpanishTdtChannel & { logoUrl?: string }>;
  getSportsMatches: () => Promise<SportsMatch[]>;
}

const LIVE_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'play_or_search_media',
    description:
      'Busca o reproduce una película, serie, episodio concreto, canal de TV en directo o partido de fútbol en RiffanTV.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        kind: {
          type: Type.STRING,
          description: 'Tipo: movie | series | channel | match',
        },
        query: {
          type: Type.STRING,
          description: 'Título limpio de película/serie, nombre de canal (ej. La 1, DAZN) o equipo',
        },
        autoPlay: {
          type: Type.BOOLEAN,
          description: 'true si el usuario pide reproducirlo directamente, false si solo pide recomendaciones o lista',
        },
        season: {
          type: Type.INTEGER,
          description: 'Número de temporada si pide un capítulo concreto',
        },
        episode: {
          type: Type.INTEGER,
          description: 'Número de capítulo/episodio si pide uno concreto',
        },
      },
      required: ['kind', 'query'],
    },
  },
  {
    name: 'open_app_section',
    description: 'Navega a una sección de RiffanTV: cine, futbol, tv, juegos, sala o amigos.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        section: {
          type: Type.STRING,
          description: 'Sección destino: cine | futbol | tv | juegos | sala | friends | surprise_me',
        },
      },
      required: ['section'],
    },
  },
  {
    name: 'control_player',
    description: 'Controla el reproductor activo en la sala.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        command: {
          type: Type.STRING,
          description: 'Comando: play | pause | mute | unmute | fullscreen | next_episode',
        },
      },
      required: ['command'],
    },
  },
];

function createGeminiClient(): GoogleGenAI | null {
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

function sendJson(ws: WebSocket, payload: Record<string, unknown>) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

export function setupGeminiLiveWebSocket(
  _httpServer: HttpServer,
  deps: GeminiLiveDeps
) {
  const liveWss = new WebSocketServer({ noServer: true });

  liveWss.on('connection', async (clientWs, req) => {
    const reqUrl = new URL(req.url || '/ws/gemini-live', 'http://localhost');
    const userName = String(reqUrl.searchParams.get('userName') || 'amigo').slice(0, 40);
    const lang = String(reqUrl.searchParams.get('lang') || 'es').toLowerCase().slice(0, 2);
    const activeMedia = String(reqUrl.searchParams.get('activeMedia') || '').slice(0, 120);

    const ai = createGeminiClient();
    if (!ai) {
      sendJson(clientWs, {
        error: 'GEMINI_API_KEY missing on server; fallback REST voice mode active.',
        fallback: true,
      });
      clientWs.close();
      return;
    }

    const langLabel =
      lang === 'ca'
        ? 'Catalán'
        : lang === 'en'
        ? 'English'
        : lang === 'zh'
        ? '中文'
        : 'Español de España';
    const voiceName = lang === 'en' ? 'Kore' : 'Zephyr';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let liveSession: any = null;
    let isClosed = false;

    const handleToolCall = async (call: {
      id?: string;
      name?: string;
      args?: Record<string, unknown>;
    }) => {
      const name = String(call.name || '');
      const args = call.args || {};

      try {
        if (name === 'control_player') {
          const cmd = String(args.command || 'pause');
          sendJson(clientWs, {
            toolAction: { type: 'player_control', payload: cmd },
          });
          return { ok: true, executed: cmd };
        }

        if (name === 'open_app_section') {
          const section = String(args.section || 'cine');
          const action =
            section === 'friends'
              ? { type: 'open_friends' }
              : section === 'surprise_me'
              ? { type: 'surprise_me' }
              : { type: 'open_world', payload: section };
          sendJson(clientWs, { toolAction: action });
          return { ok: true, opened: section };
        }

        if (name === 'play_or_search_media') {
          const kind = String(args.kind || 'movie');
          const query = String(args.query || '').trim();
          const autoPlay = args.autoPlay !== false;
          const parsedEp = parseSeriesSeasonAndEpisode(query);
          const season = Number(args.season) || parsedEp.season;
          const episode = Number(args.episode) || parsedEp.episode;

          if (kind === 'channel') {
            const matched = matchChannelsByKeywords(
              deps.getChannels(),
              query.split(/\s+/).filter(Boolean),
              '',
              5
            );
            const items = matched.map((ch) => ({
              kind: 'channel',
              id: ch.id,
              title: ch.name,
              subtitle: ch.network || ch.description,
              imageUrl: ch.logoUrl,
              badge: ch.quality || 'LIVE',
              channel: ch,
            }));
            sendJson(clientWs, {
              toolItems: items,
              autoPlay: autoPlay && items.length > 0,
            });
            return {
              found: items.length,
              titles: items.map((i) => i.title),
            };
          }

          if (kind === 'match') {
            const matches = await deps.getSportsMatches();
            const normQ = query.toLowerCase();
            const hits = matches
              .filter((m) => {
                const home = m.matchMeta?.homeTeam || '';
                const away = m.matchMeta?.awayTeam || '';
                return `${home} ${away} ${m.title} ${m.competition}`.toLowerCase().includes(normQ);
              })
              .slice(0, 5);
            const items = hits.map((m) => {
              const home = m.matchMeta?.homeTeam;
              const away = m.matchMeta?.awayTeam;
              const title = home && away ? `${home} vs ${away}` : m.title;
              const statusLabel = m.matchMeta?.statusLabel || m.time || (m.isLive ? 'EN VIVO' : '');
              const isLiveNow = m.matchMeta?.statusState === 'live' || m.isLive;
              return {
                kind: 'match',
                id: m.id,
                title,
                subtitle: statusLabel ? `${m.competition} · ${statusLabel}` : m.competition,
                badge: isLiveNow ? 'EN VIVO' : statusLabel,
                match: m,
              };
            });
            sendJson(clientWs, {
              toolItems: items,
              autoPlay: autoPlay && items.length > 0,
            });
            return {
              found: items.length,
              matches: items.map((i) => `${i.title} (${i.subtitle})`),
            };
          }

          const tmdbLang = resolveTmdbLanguageTag(lang);
          const isSeries = kind === 'series' || Boolean(season || episode);
          const endpoint = isSeries ? '/search/tv' : '/search/multi';
          const searchTitle = parsedEp.cleanTitle || query;
          const tmdbRes = await fetchTmdbJson<{
            results?: Array<{
              id: number;
              title?: string;
              name?: string;
              poster_path?: string | null;
              backdrop_path?: string | null;
              release_date?: string;
              first_air_date?: string;
              vote_average?: number;
              overview?: string;
              media_type?: 'movie' | 'tv' | 'person';
            }>;
          }>(endpoint, {
            query: searchTitle,
            language: tmdbLang,
            include_adult: false,
            page: 1,
          });

          const results = (tmdbRes?.results || [])
            .filter((r) => r.media_type !== 'person' && Boolean(r.poster_path || r.backdrop_path))
            .slice(0, 4);

          const items = results.map((r) => {
            const isTv = (r.media_type || (isSeries ? 'tv' : 'movie')) === 'tv';
            const title = (r.title || r.name || 'Sin título').trim();
            const poster = buildTmdbImageUrl(r.poster_path, 'w500') || '';
            const backdrop = buildTmdbImageUrl(r.backdrop_path, 'w780') || '';
            const year = (r.release_date || r.first_air_date || '').slice(0, 4);
            const rating = r.vote_average ? r.vote_average.toFixed(1) : '7.4';
            return {
              kind: isTv ? 'series' : 'movie',
              id: `tmdb-${isTv ? 'tv' : 'movie'}-${r.id}`,
              title,
              subtitle: year ? `${year} · ★ ${rating}` : `★ ${rating}`,
              imageUrl: poster || backdrop,
              badge: isTv ? 'SERIE' : 'CINE',
              targetSeason: season,
              targetEpisode: episode,
              media: {
                id: `tmdb-${isTv ? 'tv' : 'movie'}-${r.id}`,
                tmdbId: r.id,
                title,
                year,
                rating,
                overview: r.overview || '',
                poster,
                backdrop,
                languages: ['ES', 'LAT', 'VOSE', 'EN'],
                mediaType: isTv ? 'tv' : 'movie',
                targetSeason: season,
                targetEpisode: episode,
              },
            };
          });

          sendJson(clientWs, {
            toolItems: items,
            autoPlay: autoPlay && items.length > 0,
          });
          return {
            found: items.length,
            titles: items.map((i) => i.title),
          };
        }
      } catch (err) {
        logger.warn({ err, name }, 'gemini_live_tool_error');
      }

      return { ok: false };
    };

    try {
      liveSession = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [{ functionDeclarations: LIVE_TOOL_DECLARATIONS }],
          systemInstruction: `Eres RiffanAI, el compañero de voz natural de RiffanTV (cine, series, anime, canales en directo, fútbol, watch party y juegos).
Hablas con ${userName}. Responde siempre con naturalidad, calidez y fluidez conversacional en ${langLabel} (o el idioma en que hable el usuario), sin sonar robótico ni usar listas con markdown.
${activeMedia ? `En la sala se está reproduciendo ahora: "${activeMedia}".` : ''}
Cuando te pidan poner una película, serie, capítulo, canal o partido, o abrir una sección, llama a tus herramientas al instante y confirma brevemente en voz natural.`,
        },
        callbacks: {
          onopen: () => {
            if (!isClosed) {
              sendJson(clientWs, { ready: true, model: 'gemini-3.8-live' });
            }
          },
          onmessage: async (message: LiveServerMessage) => {
            if (isClosed) return;
            const content = message.serverContent;

            if (content?.inputTranscription?.text) {
              sendJson(clientWs, { inputTranscript: content.inputTranscription.text });
            }
            if (content?.outputTranscription?.text) {
              sendJson(clientWs, { outputTranscript: content.outputTranscription.text });
            }
            if (content?.interrupted) {
              sendJson(clientWs, { interrupted: true });
            }
            if (content?.turnComplete) {
              sendJson(clientWs, { turnComplete: true });
            }

            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                sendJson(clientWs, { audio: part.inlineData.data });
              }
            }

            const calls = message.toolCall?.functionCalls ?? [];
            if (calls.length > 0 && liveSession) {
              const responses = [];
              for (const call of calls) {
                const resPayload = await handleToolCall(call);
                responses.push({
                  id: call.id,
                  name: call.name,
                  response: resPayload,
                });
              }
              try {
                liveSession.sendToolResponse({ functionResponses: responses });
              } catch (err) {
                logger.warn({ err }, 'gemini_live_tool_response_err');
              }
            }
          },
          onerror: (err: unknown) => {
            logger.warn({ err }, 'gemini_live_session_error');
            sendJson(clientWs, { error: 'Gemini Live session error', fallback: true });
          },
          onclose: () => {
            if (!isClosed && clientWs.readyState === WebSocket.OPEN) {
              clientWs.close();
            }
          },
        },
      });
    } catch (err) {
      logger.warn({ err }, 'gemini_live_connect_failed');
      sendJson(clientWs, { error: 'Unable to connect Gemini Live session', fallback: true });
      clientWs.close();
      return;
    }

    clientWs.on('message', (raw) => {
      if (!liveSession || isClosed) return;
      try {
        const parsed = JSON.parse(raw.toString()) as {
          audio?: string;
          text?: string;
        };
        if (parsed.audio) {
          liveSession.sendRealtimeInput({
            audio: { data: parsed.audio, mimeType: 'audio/pcm;rate=16000' },
          });
        } else if (parsed.text) {
          liveSession.sendRealtimeInput({
            text: String(parsed.text).slice(0, 600),
          });
        }
      } catch {
        // Ignore malformed frame
      }
    });

    clientWs.on('close', () => {
      isClosed = true;
      try {
        liveSession?.close?.();
      } catch {
        // ignore close error
      }
      liveSession = null;
    });
  });

  return {
    handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
      liveWss.handleUpgrade(req, socket, head, (ws) => {
        liveWss.emit('connection', ws, req);
      });
    },
  };
}
