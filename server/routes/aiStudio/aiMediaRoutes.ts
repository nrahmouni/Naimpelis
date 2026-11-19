import type { Express, Request, Response } from 'express';
import { ThinkingLevel, type Content } from '@google/genai';
import {
  ALLOWED_CHAT_MODELS,
  getGenAiClient,
  sanitizeBase64Payload,
  sanitizeMimeType,
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

  // 2. CREATE & EDIT IMAGES (gemini-nano-banana-2.1 / gemini-3.1-flash-lite-image)
  app.post('/api/ai/image', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        prompt?: string;
        model?: string;
        aspectRatio?: string;
        imageSize?: string;
        sourceImageBase64?: string;
        sourceMimeType?: string;
        useSearchGrounding?: boolean;
      };

      const prompt = String(body.prompt || '').trim();
      if (!prompt) {
        res.status(400).json({ ok: false, error: 'Describe la imagen que quieres crear o editar.' });
        return;
      }

      const model =
        body.model === 'gemini-3.1-flash-lite-image'
          ? 'gemini-3.1-flash-lite-image'
          : 'gemini-nano-banana-2.1';
      const allowedAspectRatios = new Set(['1:1', '3:4', '4:3', '9:16', '16:9', '1:4', '4:1']);
      const aspectRatio = allowedAspectRatios.has(String(body.aspectRatio || '')) ? String(body.aspectRatio) : '16:9';
      const allowedSizes = new Set(['1K', '2K', '4K']);
      const imageSize = allowedSizes.has(String(body.imageSize || '')) ? String(body.imageSize) : '1K';

      const parts: Array<Record<string, unknown>> = [];
      const cleanSourceB64 = sanitizeBase64Payload(body.sourceImageBase64 || '');
      if (cleanSourceB64) {
        parts.push({
          inlineData: {
            data: cleanSourceB64,
            mimeType: sanitizeMimeType(body.sourceMimeType || 'image/png', 'image/png'),
          },
        });
      }
      parts.push({ text: prompt });

      const config: Record<string, unknown> = {
        imageConfig: model === 'gemini-nano-banana-2.1' ? { aspectRatio, imageSize } : { aspectRatio },
      };
      if (body.useSearchGrounding && model === 'gemini-nano-banana-2.1') {
        config.tools = [{ googleSearch: { searchTypes: { webSearch: {}, imageSearch: {} } } }];
      }

      const ai = getGenAiClient();
      const response = await ai.models.generateContent({ model, contents: { parts: parts as never }, config });

      let imageBase64 = '';
      let mimeType = 'image/png';
      let caption = '';
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData?.data && !imageBase64) {
          imageBase64 = part.inlineData.data;
          mimeType = part.inlineData.mimeType || 'image/png';
        } else if (part.text) {
          caption += (caption ? '\n' : '') + part.text;
        }
      }

      if (!imageBase64) {
        res.status(502).json({
          ok: false,
          error: caption || 'El modelo no devolvió ninguna imagen para este prompt.',
        });
        return;
      }

      res.json({
        ok: true,
        model,
        mimeType,
        imageBase64,
        dataUrl: `data:${mimeType};base64,${imageBase64}`,
        caption: caption.trim(),
      });
    } catch (err) {
      sendAiEndpointError(res, 'ai_studio_image', err);
    }
  });

  // 3. GENERATE MUSIC (Lyria 3 Clip & Pro)
  app.post('/api/ai/music', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        prompt?: string;
        model?: string;
        imageBase64?: string;
        imageMimeType?: string;
      };

      const prompt = String(body.prompt || '').trim();
      if (!prompt) {
        res.status(400).json({ ok: false, error: 'Describe la música o banda sonora que deseas crear.' });
        return;
      }

      const model = body.model === 'lyria-3-pro-preview' ? 'lyria-3-pro-preview' : 'lyria-3-clip-preview';
      const cleanImageB64 = sanitizeBase64Payload(body.imageBase64 || '');
      const contents = cleanImageB64
        ? {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  data: cleanImageB64,
                  mimeType: sanitizeMimeType(body.imageMimeType || 'image/jpeg', 'image/jpeg'),
                },
              },
            ],
          }
        : prompt;

      const ai = getGenAiClient();
      const responseStream = await ai.models.generateContentStream({ model, contents: contents as never });

      const audioChunks: Buffer[] = [];
      let lyrics = '';
      let mimeType = 'audio/mpeg';
      for await (const chunk of responseStream) {
        for (const part of chunk.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData?.data) {
            if (audioChunks.length === 0 && part.inlineData.mimeType) mimeType = part.inlineData.mimeType;
            audioChunks.push(Buffer.from(part.inlineData.data, 'base64'));
          }
          if (part.text) lyrics += part.text;
        }
      }

      if (audioChunks.length === 0) {
        res.status(502).json({ ok: false, error: 'No se recibió audio de Lyria para este prompt.' });
        return;
      }

      const audioBase64 = Buffer.concat(audioChunks).toString('base64');
      res.json({
        ok: true,
        model,
        mimeType,
        audioBase64,
        dataUrl: `data:${mimeType};base64,${audioBase64}`,
        lyrics: lyrics.trim(),
      });
    } catch (err) {
      sendAiEndpointError(res, 'ai_studio_music', err);
    }
  });

  // 4. GENERATE VIDEO FROM TEXT & ANIMATE IMAGES (gemini-omni-1.2-flash via Interactions API)
  app.post('/api/ai/video', async (req: Request, res: Response) => {
    req.setTimeout(310_000);
    res.setTimeout(310_000);
    try {
      const body = (req.body || {}) as {
        prompt?: string;
        imageBase64?: string;
        imageMimeType?: string;
        aspectRatio?: string;
        duration?: string;
        resolution?: string;
      };

      const prompt = String(body.prompt || '').trim();
      const cleanImageB64 = sanitizeBase64Payload(body.imageBase64 || '');
      if (!prompt && !cleanImageB64) {
        res.status(400).json({ ok: false, error: 'Indica una escena o sube una imagen para animar.' });
        return;
      }

      const aspectRatio = body.aspectRatio === '9:16' ? '9:16' : '16:9';
      const resolution = body.resolution === '1080p' ? '1080p' : '720p';
      const duration = ['3s', '5s', '8s', '10s'].includes(String(body.duration || ''))
        ? String(body.duration)
        : '6s';

      const input = cleanImageB64
        ? [
            {
              type: 'image' as const,
              mime_type: sanitizeMimeType(body.imageMimeType || 'image/png', 'image/png'),
              data: cleanImageB64,
            },
            {
              type: 'text' as const,
              text: prompt || 'Anima esta imagen con movimiento cinematográfico fluido y natural.',
            },
          ]
        : prompt;

      const ai = getGenAiClient();
      const interaction = await ai.interactions.create(
        {
          model: 'gemini-omni-1.2-flash',
          input: input as never,
          background: false,
          store: false,
          stream: false,
          response_format: {
            type: 'video',
            aspect_ratio: aspectRatio,
            duration,
            resolution,
          } as never,
        },
        { timeout: 300_000 }
      );

      let videoBase64 = interaction.output_video?.data || '';
      let mimeType = interaction.output_video?.mime_type || 'video/mp4';
      if (!videoBase64 && Array.isArray(interaction.steps)) {
        for (const step of interaction.steps) {
          if (step.type === 'model_output' && Array.isArray(step.content)) {
            const vid = step.content.find((c) => c.type === 'video') as
              | { data?: string; mime_type?: string }
              | undefined;
            if (vid?.data) {
              videoBase64 = vid.data;
              if (vid.mime_type) mimeType = vid.mime_type;
            }
          }
        }
      }

      if (!videoBase64) {
        res.status(502).json({
          ok: false,
          error: 'No se recibió secuencia de vídeo de Omni Flash. Intenta con otra descripción.',
        });
        return;
      }

      res.json({
        ok: true,
        model: 'gemini-omni-1.2-flash',
        mimeType,
        videoBase64,
        dataUrl: `data:${mimeType};base64,${videoBase64}`,
      });
    } catch (err) {
      sendAiEndpointError(res, 'ai_studio_video', err);
    }
  });
}
