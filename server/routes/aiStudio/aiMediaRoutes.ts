import type { Express, Request, Response } from 'express';
import { ThinkingLevel, type Content } from '@google/genai';
import {
  ALLOWED_CHAT_MODELS,
  getGenAiClient,
  sendAiEndpointError,
  type AllowedChatModel,
} from './shared.ts';

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
      const response = await ai.models.generateContent({ model, contents, config });
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
}
