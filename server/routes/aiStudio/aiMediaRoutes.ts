import type { Express, Request, Response } from 'express';
import { ThinkingLevel, Type, type Content } from '@google/genai';
import {
  ALLOWED_CHAT_MODELS,
  generateContentWithResilience,
  getGenAiClient,
  isAiFallbackEligibleError,
  sendAiEndpointError,
  type AllowedChatModel,
} from './shared.ts';
import { buildTelemetryMatchInsights } from './matchAnalyticsFallback.ts';

interface GroundingSource {
  kind: 'web' | 'maps';
  title: string;
  uri: string;
  snippets?: string[];
}

type RawGroundingChunk = {
  web?: { uri?: string; title?: string };
  maps?: {
    uri?: string;
    title?: string;
    placeId?: string;
    placeAnswerSources?: { reviewSnippets?: Array<{ content?: string }> };
  };
};

function resolveChatLangLabel(lang?: string): string {
  if (lang === 'en') return 'English';
  if (lang === 'ca') return 'Catalan';
  if (lang === 'zh') return 'Simplified Chinese';
  return 'Spanish';
}

function collectGroundingSources(rawChunks: RawGroundingChunk[]): GroundingSource[] {
  const sources: GroundingSource[] = [];
  const seenUris = new Set<string>();
  for (const ch of rawChunks) {
    if (ch.web?.uri && !seenUris.has(ch.web.uri)) {
      seenUris.add(ch.web.uri);
      sources.push({ kind: 'web', title: ch.web.title || ch.web.uri, uri: ch.web.uri });
    }
    if (ch.maps?.uri && !seenUris.has(ch.maps.uri)) {
      seenUris.add(ch.maps.uri);
      const snippets = (ch.maps.placeAnswerSources?.reviewSnippets || [])
        .map((s) => String(s.content || '').trim())
        .filter(Boolean)
        .slice(0, 2);
      sources.push({ kind: 'maps', title: ch.maps.title || 'Google Maps', uri: ch.maps.uri, snippets });
    }
  }
  return sources;
}

export function registerAiMediaRoutes(app: Express): void {
  // 1. MULTI-TURN GEMINI CHAT + SEARCH / MAPS GROUNDING
  app.post('/api/ai/chat', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        messages?: Array<{ role?: string; text?: string }>;
        model?: string;
        grounding?: 'none' | 'search' | 'maps';
        thinkingDepth?: 'low' | 'medium' | 'high';
        lat?: number;
        lng?: number;
        lang?: string;
      };

      const cleanedMessages = (Array.isArray(body.messages) ? body.messages : [])
        .map((m) => ({
          role: m.role === 'assistant' || m.role === 'model' ? ('model' as const) : ('user' as const),
          text: String(m.text || '').trim(),
        }))
        .filter((m) => m.text.length > 0)
        .slice(-20);

      if (cleanedMessages.length === 0) {
        res.status(400).json({ ok: false, error: 'Escribe un mensaje para iniciar el chat.' });
        return;
      }

      const requestedModel = String(body.model || 'gemini-4-hydrogen') as AllowedChatModel;
      const model: AllowedChatModel = ALLOWED_CHAT_MODELS.has(requestedModel)
        ? requestedModel
        : 'gemini-4-hydrogen';
      const grounding = body.grounding === 'search' || body.grounding === 'maps' ? body.grounding : 'none';
      const contents: Content[] = cleanedMessages.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));

      const config: Record<string, unknown> = {
        systemInstruction: `Eres RiffanAI Director, el copiloto experto en cine, series, rodajes, música, fútbol y creación audiovisual dentro de RiffanTV. Responde siempre en ${resolveChatLangLabel(body.lang)} (o en el idioma en que el usuario escriba), con formato claro, preciso y útil.`,
      };

      if (model !== 'gemini-3.1-flash-lite') {
        const thinkingMap: Record<string, ThinkingLevel> = {
          low: ThinkingLevel.LOW,
          medium: ThinkingLevel.MEDIUM,
          high: ThinkingLevel.HIGH,
        };
        const level = thinkingMap[String(body.thinkingDepth || '')];
        if (level) config.thinkingConfig = { thinkingLevel: level };
      }

      if (grounding === 'search') {
        config.tools = [{ googleSearch: {} }];
      } else if (grounding === 'maps') {
        config.tools = [{ googleMaps: {} }];
        if (
          typeof body.lat === 'number' &&
          typeof body.lng === 'number' &&
          Number.isFinite(body.lat) &&
          Number.isFinite(body.lng)
        ) {
          config.toolConfig = {
            retrievalConfig: { latLng: { latitude: body.lat, longitude: body.lng } },
          };
        }
      }

      const ai = getGenAiClient();
      const response = await generateContentWithResilience(ai, { model, contents, config });
      const reply = String(response.text || '').trim();
      const rawChunks = (response.candidates?.[0]?.groundingMetadata?.groundingChunks || []) as RawGroundingChunk[];
      const mapsWidgetToken =
        (response.candidates?.[0]?.groundingMetadata as { googleMapsWidgetContextToken?: string } | undefined)
          ?.googleMapsWidgetContextToken || null;

      res.json({
        ok: true,
        reply: reply || 'Sin respuesta generada.',
        model,
        grounding,
        sources: collectGroundingSources(rawChunks),
        mapsWidgetToken,
      });
    } catch (err) {
      sendAiEndpointError(res, 'ai_studio_chat', err);
    }
  });

  // 2. PRO LIVE MATCH BROADCAST INSIGHTS (STRUCTURED JSON + LIVE TELEMETRY / SEARCH GROUNDING)
  app.post('/api/ai/match-insights', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        homeTeam?: string;
        awayTeam?: string;
        homeScore?: string;
        awayScore?: string;
        statusState?: 'live' | 'upcoming' | 'finished';
        statusLabel?: string;
        competition?: string;
        venue?: string;
        shotsCount?: number;
        stats?: Array<{ label?: string; homeValue?: string; awayValue?: string }>;
        events?: Array<{ time?: string; type?: string; team?: string; player?: string; detail?: string }>;
        previousHeadlines?: string[];
        lang?: string;
      };

      const homeTeam = String(body.homeTeam || '').trim();
      const awayTeam = String(body.awayTeam || '').trim();
      if (!homeTeam || !awayTeam) {
        res.status(400).json({ ok: false, error: 'Se requieren los nombres de ambos equipos.' });
        return;
      }

      const langLabel = resolveChatLangLabel(body.lang);
      const statusState =
        body.statusState === 'live' || body.statusState === 'finished' ? body.statusState : 'upcoming';
      const statusLabel = String(body.statusLabel || '').trim();
      const homeScore = String(body.homeScore ?? '-').trim();
      const awayScore = String(body.awayScore ?? '-').trim();
      const competition = String(body.competition || '').trim();
      const venue = String(body.venue || '').trim();

      const statsList = (Array.isArray(body.stats) ? body.stats : [])
        .slice(0, 16)
        .map((s) => `${String(s.label || '').trim()}: ${String(s.homeValue || '-')} vs ${String(s.awayValue || '-')}`)
        .filter(Boolean);

      const eventsList = (Array.isArray(body.events) ? body.events : [])
        .slice(-10)
        .map(
          (e) =>
            `${String(e.time || '').trim()} ${String(e.type || '').trim()} (${String(e.team || '').trim()}) ${String(e.player || '').trim()}${
              e.detail ? ` - ${String(e.detail).trim()}` : ''
            }`.trim()
        )
        .filter(Boolean);

      const previousHeadlines = (Array.isArray(body.previousHeadlines) ? body.previousHeadlines : [])
        .map((h) => String(h || '').trim())
        .filter(Boolean)
        .slice(-5);

      try {
        const ai = getGenAiClient();
        const hasLiveTelemetry = statsList.length >= 2 || eventsList.length >= 1;
        let searchBrief = '';
        let sources: GroundingSource[] = [];

        if (!hasLiveTelemetry) {
          const searchPrompt = `Busca datos actuales, estado del partido, estadísticas clave, rachas recientes y jugadores determinantes del partido de fútbol ${homeTeam} vs ${awayTeam}${
            competition ? ` (${competition})` : ''
          }. Resume solo hechos y cifras reales brevemente.`;
          try {
            const searchResp = await generateContentWithResilience(ai, {
              model: 'gemini-3.1-flash-lite',
              contents: searchPrompt,
              config: {
                tools: [{ googleSearch: {} }],
              },
            });
            searchBrief = String(searchResp.text || '').trim();
            const rawChunks = (searchResp.candidates?.[0]?.groundingMetadata?.groundingChunks ||
              []) as RawGroundingChunk[];
            sources = collectGroundingSources(rawChunks).slice(0, 4);
          } catch (searchErr) {
            if (isAiFallbackEligibleError(searchErr)) {
              throw searchErr;
            }
            // Continue with direct match metadata if search tool is unavailable
          }
        }

        const telemetryLines = [
          `Partido: ${homeTeam} vs ${awayTeam}`,
          competition ? `Competición: ${competition}` : '',
          venue ? `Estadio: ${venue}` : '',
          `Estado: ${statusState}${statusLabel ? ` (${statusLabel})` : ''}`,
          `Marcador actual: ${homeTeam} ${homeScore} - ${awayScore} ${awayTeam}`,
          typeof body.shotsCount === 'number' && body.shotsCount > 0
            ? `Mapa de tiros registrados: ${body.shotsCount}`
            : '',
          statsList.length > 0 ? `Estadísticas oficiales en vivo:\n- ${statsList.join('\n- ')}` : '',
          eventsList.length > 0 ? `Eventos recientes:\n- ${eventsList.join('\n- ')}` : '',
          searchBrief ? `Contexto contrastado:\n${searchBrief}` : '',
          previousHeadlines.length > 0
            ? `Titulares ya mostrados (aporta ángulos nuevos sin repetir literalmente):\n- ${previousHeadlines.join('\n- ')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n\n');

        const insightsResponse = await generateContentWithResilience(ai, {
          model: 'gemini-3.1-flash-lite',
          contents: telemetryLines,
          config: {
            systemInstruction: `Eres el analista jefe de datos de retransmisión estilo Opta / DAZN Beyond Stats en RiffanTV. Genera exactamente 3 o 4 cápsulas estadísticas de alto valor táctico en ${langLabel}. Usa exclusivamente las cifras proporcionadas o contrastadas; si un dato numérico exacto no está disponible en previa, destaca tendencias reales, duelos clave o ritmo del encuentro sin inventar estadísticas falsas. Conciso, profesional y con tono televisivo experto.`,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headline: {
                type: Type.STRING,
                description: 'Titular táctico breve (máx. 95 caracteres) sobre el momento actual del partido.',
              },
              momentum: {
                type: Type.OBJECT,
                properties: {
                  favoredTeam: {
                    type: Type.STRING,
                    description: 'Valores permitidos: home, away o balanced.',
                  },
                  intensity: {
                    type: Type.INTEGER,
                    description: 'Índice de dominio o intensidad de 10 a 100.',
                  },
                  summary: {
                    type: Type.STRING,
                    description: 'Frase corta (máx. 90 caracteres) explicando el dominio actual.',
                  },
                },
                required: ['favoredTeam', 'intensity', 'summary'],
              },
              cards: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    category: {
                      type: Type.STRING,
                      description: 'Una de: tactical, danger, efficiency, trend, projection.',
                    },
                    label: {
                      type: Type.STRING,
                      description: 'Título corto de la métrica (2-4 palabras).',
                    },
                    metric: {
                      type: Type.STRING,
                      description: 'Dato o comparativa clave corta (ej: "64% vs 36%", "1.82 xG", "4 tiros / 15\'").',
                    },
                    teamFocus: {
                      type: Type.STRING,
                      description: 'Una de: home, away, both.',
                    },
                    insight: {
                      type: Type.STRING,
                      description: 'Lectura profesional breve (1-2 frases directas) explicando el impacto en el partido.',
                    },
                  },
                  required: ['category', 'label', 'metric', 'teamFocus', 'insight'],
                },
              },
              watchNext: {
                type: Type.STRING,
                description: 'Qué factor táctico o jugador vigilar en los próximos 15 minutos (1 frase).',
              },
            },
            required: ['headline', 'momentum', 'cards', 'watchNext'],
          },
        },
      });

      const rawJson = String(insightsResponse.text || '{}').trim();
      const parsed = JSON.parse(rawJson) as {
        headline?: string;
        momentum?: { favoredTeam?: string; intensity?: number; summary?: string };
        cards?: Array<{
          category?: string;
          label?: string;
          metric?: string;
          teamFocus?: string;
          insight?: string;
        }>;
        watchNext?: string;
      };

      const normalizedFavored =
        parsed.momentum?.favoredTeam === 'home' || parsed.momentum?.favoredTeam === 'away'
          ? parsed.momentum.favoredTeam
          : 'balanced';
      const normalizedIntensity = Math.max(
        10,
        Math.min(100, Math.round(Number(parsed.momentum?.intensity) || 55))
      );

        res.json({
          ok: true,
          engineMode: 'gemini',
          headline: String(parsed.headline || '').trim(),
          momentum: {
            favoredTeam: normalizedFavored,
            intensity: normalizedIntensity,
            summary: String(parsed.momentum?.summary || '').trim(),
          },
          cards: (Array.isArray(parsed.cards) ? parsed.cards : []).slice(0, 4).map((c) => ({
            category: String(c.category || 'tactical'),
            label: String(c.label || '').trim(),
            metric: String(c.metric || '').trim(),
            teamFocus: c.teamFocus === 'home' || c.teamFocus === 'away' ? c.teamFocus : 'both',
            insight: String(c.insight || '').trim(),
          })),
          watchNext: String(parsed.watchNext || '').trim(),
          sources,
          generatedAt: Date.now(),
        });
      } catch (aiErr) {
        if (isAiFallbackEligibleError(aiErr)) {
          res.json(buildTelemetryMatchInsights(body));
          return;
        }
        throw aiErr;
      }
    } catch (err) {
      sendAiEndpointError(res, 'ai_match_insights', err);
    }
  });

  // 3. LIVE MATCH VIDEO TACTICAL VISION (MULTIMODAL FRAME TRACKING: PLAYERS, PASSING LINES, ATTACKS & POSSESSION)
  app.post('/api/ai/tactical-vision', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        imageBase64?: string;
        mimeType?: string;
        homeTeam?: string;
        awayTeam?: string;
        homeShort?: string;
        awayShort?: string;
        homeScore?: string;
        awayScore?: string;
        statusLabel?: string;
        competition?: string;
        homeRoster?: Array<{ jersey?: string; name?: string; shortName?: string; position?: string }>;
        awayRoster?: Array<{ jersey?: string; name?: string; shortName?: string; position?: string }>;
        liveStats?: Array<{ label?: string; homeValue?: string; awayValue?: string }>;
        lang?: string;
      };

      let rawBase64 = String(body.imageBase64 || '').trim();
      let mimeType = String(body.mimeType || 'image/jpeg').trim().toLowerCase();
      const dataUrlMatch = /^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i.exec(rawBase64);
      if (dataUrlMatch) {
        mimeType = dataUrlMatch[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : dataUrlMatch[1].toLowerCase();
        rawBase64 = dataUrlMatch[2];
      }
      if (!rawBase64 || rawBase64.length < 120) {
        res.status(400).json({ ok: false, error: 'Se requiere un fotograma válido del partido.' });
        return;
      }
      if (rawBase64.length > 3_500_000) {
        res.status(400).json({ ok: false, error: 'El fotograma excede el tamaño máximo permitido.' });
        return;
      }
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
        mimeType = 'image/jpeg';
      }

      const langLabel = resolveChatLangLabel(body.lang);
      const homeTeam = String(body.homeTeam || 'Local').trim();
      const awayTeam = String(body.awayTeam || 'Visitante').trim();
      const homeShort = String(body.homeShort || homeTeam.slice(0, 3).toUpperCase()).trim();
      const awayShort = String(body.awayShort || awayTeam.slice(0, 3).toUpperCase()).trim();
      const homeScore = String(body.homeScore ?? '-').trim();
      const awayScore = String(body.awayScore ?? '-').trim();
      const statusLabel = String(body.statusLabel || '').trim();
      const competition = String(body.competition || '').trim();

      const formatRoster = (
        list?: Array<{ jersey?: string; name?: string; shortName?: string; position?: string }>
      ) =>
        (Array.isArray(list) ? list : [])
          .slice(0, 14)
          .map((p) => {
            const num = String(p.jersey || '').trim();
            const pname = String(p.shortName || p.name || '').trim();
            const pos = String(p.position || '').trim();
            return [num ? `#${num}` : '', pname, pos ? `(${pos})` : ''].filter(Boolean).join(' ');
          })
          .filter(Boolean)
          .join(', ');

      const homeRosterText = formatRoster(body.homeRoster);
      const awayRosterText = formatRoster(body.awayRoster);
      const statsText = (Array.isArray(body.liveStats) ? body.liveStats : [])
        .slice(0, 8)
        .map((s) => `${String(s.label || '').trim()}: ${String(s.homeValue || '-')} vs ${String(s.awayValue || '-')}`)
        .filter(Boolean)
        .join(' · ');

      const promptParts = [
        `Analiza este fotograma real de la retransmisión de fútbol: ${homeTeam} (${homeShort}) vs ${awayTeam} (${awayShort})`,
        competition ? `Competición: ${competition}` : '',
        statusLabel ? `Minuto/Estado: ${statusLabel} · Marcador ${homeScore}-${awayScore}` : '',
        homeRosterText ? `Alineación ${homeTeam}: ${homeRosterText}` : '',
        awayRosterText ? `Alineación ${awayTeam}: ${awayRosterText}` : '',
        statsText ? `Estadísticas en vivo de apoyo: ${statsText}` : '',
        `Instrucciones de visión táctica:`,
        `1. Indica isMatchPitchVisible=true SOLO si se ve el terreno de juego/jugadores en jugada real (false si es publicidad, estudio, gráfico a pantalla completa o primer plano sin campo).`,
        `2. Usa coordenadas normalizadas exactas sobre la imagen: x de 0 (borde izquierdo) a 1000 (borde derecho), y de 0 (borde superior) a 1000 (borde inferior).`,
        `3. Detecta hasta 12 jugadores claramente visibles sobre el césped, con su posición exacta (x, y en torso/cabeza), equipo (home o away), si lleva o disputa el balón (hasBall) y nombre: usa el apellido real de la alineación SOLO si el dorsal, gráfico TV o posición clara en pantalla permite identificarlo; si no es distinguible, usa una etiqueta táctica corta como "#8 Medio" o "Extremo" sin inventar nombres.`,
        `4. Traza passingLines conectando los id de jugadores que forman líneas tácticas (defensa/medio) o triángulos/opciones claras de pase en ese instante.`,
        `5. Traza attacks (1 a 3 vectores) mostrando los ataques en curso o ataques hechos más claros en esa jugada (banda, pase filtrado, contraataque o amenaza de tiro).`,
        `6. Estima possession (equipo con posesión actual en la jugada + porcentaje de posesión calibrado con estadísticas si existen + zona) y attacksSummary (conteo de ataques peligrosos y fase de juego) en ${langLabel}.`,
      ]
        .filter(Boolean)
        .join('\n');

      const ai = getGenAiClient();
      const visionResponse = await generateContentWithResilience(ai, {
        model: 'gemini-3.1-flash-lite',
        contents: {
          parts: [
            { inlineData: { mimeType, data: rawBase64 } },
            { text: promptParts },
          ],
        },
        config: {
          systemInstruction: `Eres un sistema óptico de tracking táctico estilo Tracab / ChyronHego / DAZN Beyond Stats para RiffanTV. Devuelve exclusivamente JSON válido ajustado al esquema con coordenadas precisas sobre el fotograma y textos en ${langLabel}.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isMatchPitchVisible: {
                type: Type.BOOLEAN,
                description: 'True si se observa el césped y jugadores en acción; false en anuncios o planos sin campo.',
              },
              homeKitColor: {
                type: Type.STRING,
                description: 'Color hexadecimal CSS dominante de la camiseta del equipo local en el fotograma.',
              },
              awayKitColor: {
                type: Type.STRING,
                description: 'Color hexadecimal CSS dominante de la camiseta del equipo visitante en el fotograma.',
              },
              possession: {
                type: Type.OBJECT,
                properties: {
                  team: { type: Type.STRING, description: 'home, away o contested.' },
                  homePct: { type: Type.INTEGER, description: 'Posesión estimada del local (0-100).' },
                  awayPct: { type: Type.INTEGER, description: 'Posesión estimada del visitante (0-100).' },
                  zoneLabel: { type: Type.STRING, description: 'Zona del campo donde está el balón.' },
                  summary: { type: Type.STRING, description: 'Frase corta de posesión actual.' },
                },
                required: ['team', 'homePct', 'awayPct', 'zoneLabel', 'summary'],
              },
              players: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    name: { type: Type.STRING },
                    jersey: { type: Type.STRING },
                    team: { type: Type.STRING, description: 'home o away.' },
                    x: { type: Type.INTEGER, description: '0..1000 horizontal en la imagen.' },
                    y: { type: Type.INTEGER, description: '0..1000 vertical en la imagen.' },
                    hasBall: { type: Type.BOOLEAN },
                    roleHint: { type: Type.STRING },
                  },
                  required: ['id', 'name', 'team', 'x', 'y', 'hasBall'],
                },
              },
              passingLines: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    fromId: { type: Type.STRING },
                    toId: { type: Type.STRING },
                    team: { type: Type.STRING, description: 'home o away.' },
                    kind: { type: Type.STRING, description: 'pass_link, compact_line o switch.' },
                  },
                  required: ['fromId', 'toId', 'team', 'kind'],
                },
              },
              attacks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    team: { type: Type.STRING, description: 'home o away.' },
                    fromX: { type: Type.INTEGER },
                    fromY: { type: Type.INTEGER },
                    toX: { type: Type.INTEGER },
                    toY: { type: Type.INTEGER },
                    type: { type: Type.STRING, description: 'through_ball, wing_attack, shot_threat o counter.' },
                    label: { type: Type.STRING },
                  },
                  required: ['id', 'team', 'fromX', 'fromY', 'toX', 'toY', 'type', 'label'],
                },
              },
              attacksSummary: {
                type: Type.OBJECT,
                properties: {
                  homeAttacks: { type: Type.INTEGER },
                  awayAttacks: { type: Type.INTEGER },
                  phaseLabel: { type: Type.STRING },
                },
                required: ['homeAttacks', 'awayAttacks', 'phaseLabel'],
              },
              tacticalNote: {
                type: Type.STRING,
                description: 'Observación táctica breve (1 frase) de la jugada visible.',
              },
            },
            required: [
              'isMatchPitchVisible',
              'homeKitColor',
              'awayKitColor',
              'possession',
              'players',
              'passingLines',
              'attacks',
              'attacksSummary',
              'tacticalNote',
            ],
          },
        },
      });

      const clampCoord = (val: unknown) => Math.max(20, Math.min(980, Math.round(Number(val) || 500)));
      const normalizeHex = (val: unknown, fallback: string) => {
        const raw = String(val || '').trim();
        return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : fallback;
      };

      const parsed = JSON.parse(String(visionResponse.text || '{}').trim()) as {
        isMatchPitchVisible?: boolean;
        homeKitColor?: string;
        awayKitColor?: string;
        possession?: {
          team?: string;
          homePct?: number;
          awayPct?: number;
          zoneLabel?: string;
          summary?: string;
        };
        players?: Array<{
          id?: string;
          name?: string;
          jersey?: string;
          team?: string;
          x?: number;
          y?: number;
          hasBall?: boolean;
          roleHint?: string;
        }>;
        passingLines?: Array<{
          fromId?: string;
          toId?: string;
          team?: string;
          kind?: string;
        }>;
        attacks?: Array<{
          id?: string;
          team?: string;
          fromX?: number;
          fromY?: number;
          toX?: number;
          toY?: number;
          type?: string;
          label?: string;
        }>;
        attacksSummary?: {
          homeAttacks?: number;
          awayAttacks?: number;
          phaseLabel?: string;
        };
        tacticalNote?: string;
      };

      const rawPlayers = Array.isArray(parsed.players) ? parsed.players.slice(0, 12) : [];
      const players = rawPlayers
        .filter((p) => p && (p.id || p.name))
        .map((p, idx) => ({
          id: String(p.id || `p${idx + 1}`).trim(),
          name: String(p.name || `#${p.jersey || idx + 1}`).trim().slice(0, 26),
          jersey: String(p.jersey || '').trim().slice(0, 4),
          team: (p.team === 'away' ? 'away' : 'home') as 'home' | 'away',
          x: clampCoord(p.x),
          y: clampCoord(p.y),
          hasBall: Boolean(p.hasBall),
          roleHint: String(p.roleHint || '').trim().slice(0, 24),
        }));
      const validPlayerIds = new Set(players.map((p) => p.id));

      const passingLines = (Array.isArray(parsed.passingLines) ? parsed.passingLines : [])
        .filter((l) => l && validPlayerIds.has(String(l.fromId || '')) && validPlayerIds.has(String(l.toId || '')) && l.fromId !== l.toId)
        .slice(0, 10)
        .map((l) => ({
          fromId: String(l.fromId),
          toId: String(l.toId),
          team: (l.team === 'away' ? 'away' : 'home') as 'home' | 'away',
          kind:
            l.kind === 'compact_line' || l.kind === 'switch'
              ? (l.kind as 'compact_line' | 'switch')
              : ('pass_link' as const),
        }));

      const attacks = (Array.isArray(parsed.attacks) ? parsed.attacks : [])
        .slice(0, 4)
        .map((a, idx) => ({
          id: String(a.id || `atk${idx + 1}`),
          team: (a.team === 'away' ? 'away' : 'home') as 'home' | 'away',
          fromX: clampCoord(a.fromX),
          fromY: clampCoord(a.fromY),
          toX: clampCoord(a.toX),
          toY: clampCoord(a.toY),
          type:
            a.type === 'wing_attack' || a.type === 'shot_threat' || a.type === 'counter'
              ? (a.type as 'wing_attack' | 'shot_threat' | 'counter')
              : ('through_ball' as const),
          label: String(a.label || '').trim().slice(0, 28),
        }));

      const homePctRaw = Math.max(0, Math.min(100, Math.round(Number(parsed.possession?.homePct) || 50)));
      const awayPctRaw = Math.max(0, Math.min(100, 100 - homePctRaw));

      res.json({
        ok: true,
        engineMode: 'gemini',
        analysis: {
          isMatchPitchVisible: Boolean(parsed.isMatchPitchVisible),
          homeKitColor: normalizeHex(parsed.homeKitColor, '#00F593'),
          awayKitColor: normalizeHex(parsed.awayKitColor, '#9146FF'),
          possession: {
            team:
              parsed.possession?.team === 'home' || parsed.possession?.team === 'away'
                ? parsed.possession.team
                : 'contested',
            homePct: homePctRaw,
            awayPct: awayPctRaw,
            zoneLabel: String(parsed.possession?.zoneLabel || '').trim(),
            summary: String(parsed.possession?.summary || '').trim(),
          },
          players,
          passingLines,
          attacks,
          attacksSummary: {
            homeAttacks: Math.max(0, Math.round(Number(parsed.attacksSummary?.homeAttacks) || 0)),
            awayAttacks: Math.max(0, Math.round(Number(parsed.attacksSummary?.awayAttacks) || 0)),
            phaseLabel: String(parsed.attacksSummary?.phaseLabel || '').trim(),
          },
          tacticalNote: String(parsed.tacticalNote || '').trim(),
        },
        analyzedAt: Date.now(),
      });
    } catch (err) {
      if (isAiFallbackEligibleError(err)) {
        res.json({
          ok: true,
          engineMode: 'use_local_optical',
          fallbackSuggested: true,
          retryAfterMs: 65_000,
        });
        return;
      }
      sendAiEndpointError(res, 'ai_tactical_vision', err);
    }
  });
}
