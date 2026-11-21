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
import { registerTacticalVisionRoute } from './tacticalVisionRoute.ts';

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

  // 3. LIVE MATCH VIDEO TACTICAL VISION
  registerTacticalVisionRoute(app);
}
