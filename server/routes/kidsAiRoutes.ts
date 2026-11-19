import type { Express, Request, Response } from 'express';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { buildTmdbImageUrl, fetchTmdbJson } from '../services/tmdbService.ts';
import { logger } from '../utils/logger.ts';
import type { CatalogMovie } from '../../src/types.ts';
import {
  KIDS_AUDIO_BADGE_MAP,
  KIDS_LANGUAGE_NAMES,
  KIDS_TMDB_LANG_MAP,
  normalizeKidsLang,
  type KidsAgeGroup,
  type KidsLanguageCode,
  type TmdbResultItem,
} from './kidsData.ts';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    ''
  ).trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: { 'User-Agent': 'aistudio-build' },
    },
  });
}

function parseGeminiJson<T>(rawText: string | undefined, fallback: T): T {
  const trimmed = String(rawText || '').trim();
  if (!trimmed) return fallback;
  const cleaned = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    }
    throw new Error('Invalid JSON returned by AI model');
  }
}

function formatGeminiRouteError(err: unknown, defaultMsg: string): { status: number; message: string } {
  const rawMsg = err instanceof Error ? err.message : String(err || '');
  const anyErr = err as { status?: number; code?: number };
  const statusCode = Number(anyErr?.status || anyErr?.code || 0);

  if (
    statusCode === 400 ||
    statusCode === 403 ||
    /API_KEY_INVALID|PERMISSION_DENIED|ACCESS_TOKEN_SCOPE_INSUFFICIENT|API key/i.test(rawMsg)
  ) {
    return {
      status: statusCode === 400 ? 400 : 403,
      message: 'La clave de IA no es válida o no tiene permisos. Revísala en Settings > Secrets.',
    };
  }
  if (statusCode === 429 || /RESOURCE_EXHAUSTED|quota|rate limit/i.test(rawMsg)) {
    return {
      status: 429,
      message: 'Límite temporal de consultas IA alcanzado. Intenta de nuevo en unos segundos.',
    };
  }
  if (statusCode === 404 || /NOT_FOUND/i.test(rawMsg)) {
    return {
      status: 404,
      message: 'Modelo de IA no disponible temporalmente.',
    };
  }
  if (statusCode === 504 || /timeout|ETIMEDOUT|ABORT_ERR/i.test(rawMsg)) {
    return {
      status: 504,
      message: 'Profe IA tardó demasiado en responder. Pulsa de nuevo para reintentar.',
    };
  }
  return {
    status: 500,
    message: defaultMsg,
  };
}

async function withGeminiTimeout<T>(fn: () => Promise<T>, timeoutMs = 12000): Promise<T> {
  return await Promise.race([
    fn(),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Gemini request timeout')), timeoutMs);
    }),
  ]);
}

async function withGeminiRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await withGeminiTimeout(fn, 12000);
  } catch (err) {
    const anyErr = err as { status?: number };
    const status = Number(anyErr?.status || 0);
    const msg = err instanceof Error ? err.message : '';
    if (
      status === 400 ||
      status === 401 ||
      status === 403 ||
      status === 404 ||
      status === 429 ||
      /timeout/i.test(msg)
    ) {
      throw err;
    }
    await new Promise((r) => setTimeout(r, 320));
    return await withGeminiTimeout(fn, 10000);
  }
}

export function mapTmdbItemToKidsCatalogMovie(
  item: TmdbResultItem,
  mediaType: 'movie' | 'tv',
  kidsLang: KidsLanguageCode
): CatalogMovie | null {
  if (!item?.id || !item?.poster_path) return null;
  const title = item.title || item.name || item.original_title || item.original_name || 'Riffan Kids';
  const rawDate = item.release_date || item.first_air_date || '';
  const year = rawDate ? rawDate.slice(0, 4) : '2024';
  const langBadges = KIDS_AUDIO_BADGE_MAP[kidsLang] || ['ES'];

  return {
    id: `kids-${mediaType}-${item.id}`,
    tmdbId: item.id,
    mediaType,
    title,
    originalTitle: item.original_title || item.original_name || title,
    year,
    rating: Number(item.vote_average || 7.5).toFixed(1),
    overview: item.overview || '',
    poster: buildTmdbImageUrl(item.poster_path, 'w500'),
    backdrop: item.backdrop_path
      ? buildTmdbImageUrl(item.backdrop_path, 'w780')
      : buildTmdbImageUrl(item.poster_path, 'w780'),
    languages: langBadges,
    genres: mediaType === 'tv' ? ['Infantil', 'Serie'] : ['Infantil', 'Animación'],
    platform: 'Riffan Kids',
    quality: 'HD Kids',
  };
}

export function registerKidsAiRoutes(app: Express): void {
  // 0. Server AI / Gemini TTS capability discovery
  app.get('/api/kids/capabilities', (_req: Request, res: Response) => {
    const aiAvailable = Boolean(getGeminiClient());
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      aiAvailable,
      ttsAvailable: aiAvailable,
    });
  });

  // 2. Gemini AI Kids Movie & Series Finder + Real TMDB Resolution
  app.post('/api/kids/ai-recommend', async (req: Request, res: Response) => {
    const kidsLang = normalizeKidsLang(req.body?.lang);
    const ageGroup = (String(req.body?.ageGroup || '6-8') as KidsAgeGroup);
    const prompt = String(req.body?.prompt || '').trim();

    if (!prompt) {
      return res.status(400).json({ ok: false, error: 'Prompt requerido' });
    }

    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        ok: false,
        error: 'La clave de IA (GEMINI_API_KEY) no está configurada en el servidor.',
      });
    }

    try {
      const response = await withGeminiRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `You are Riffan Kids curator. A family wants age-safe movie or kids TV series recommendations for age group ${ageGroup} years old.
Target language for reply: ${KIDS_LANGUAGE_NAMES[kidsLang]}.
User request: "${prompt}"
Return 5 kid-safe animated or family movies/series matching the request. Use exact widely known English or international titles for searchTitle so TMDB search finds them reliably.`,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                friendlyIntro: { type: Type.STRING },
                picks: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      searchTitle: { type: Type.STRING },
                      mediaType: { type: Type.STRING },
                      whyKidsLoveIt: { type: Type.STRING },
                    },
                    required: ['searchTitle', 'mediaType', 'whyKidsLoveIt'],
                  },
                },
              },
              required: ['friendlyIntro', 'picks'],
            },
          },
        })
      );

      const parsed = parseGeminiJson<{
        friendlyIntro?: string;
        picks?: Array<{ searchTitle: string; mediaType: string; whyKidsLoveIt: string }>;
      }>(response.text, {});

      const tmdbLang = KIDS_TMDB_LANG_MAP[kidsLang] || 'es-ES';
      const picks = Array.isArray(parsed.picks) ? parsed.picks.slice(0, 6) : [];
      const resolvedItems: Array<CatalogMovie & { aiReason: string }> = [];

      await Promise.all(
        picks.map(async (pick) => {
          const mediaType: 'movie' | 'tv' = pick.mediaType === 'tv' ? 'tv' : 'movie';
          const searchRes = await fetchTmdbJson<{ results?: TmdbResultItem[] }>(
            `/search/${mediaType}?query=${encodeURIComponent(pick.searchTitle)}&language=${tmdbLang}&include_adult=false&page=1`
          ).catch(() => null);
          const first = searchRes?.results?.find((r) => Boolean(r.poster_path));
          const mapped = first ? mapTmdbItemToKidsCatalogMovie(first, mediaType, kidsLang) : null;
          if (mapped) {
            resolvedItems.push({ ...mapped, aiReason: pick.whyKidsLoveIt });
          }
        })
      );

      res.json({
        ok: true,
        intro: parsed.friendlyIntro || '',
        items: resolvedItems,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn({ errMsg, kidsLang }, 'kids_ai_recommend_error');
      const mappedErr = formatGeminiRouteError(err, 'No se pudo generar la recomendación IA.');
      res.status(mappedErr.status).json({ ok: false, error: mappedErr.message });
    }
  });

  // 3. Gemini Interactive Educational Storytelling Studio (8 Languages)
  app.post('/api/kids/ai-story', async (req: Request, res: Response) => {
    const kidsLang = normalizeKidsLang(req.body?.lang);
    const ageGroup = (String(req.body?.ageGroup || '6-8') as KidsAgeGroup);
    const hero = String(req.body?.hero || 'Zorro Estrella').trim().slice(0, 60);
    const setting = String(req.body?.setting || 'Bosque Mágico').trim().slice(0, 80);
    const moralValue = String(req.body?.moralValue || 'Amistad y curiosidad').trim().slice(0, 80);
    const previousStory = String(req.body?.previousStory || '').trim().slice(0, 1200);
    const chosenAction = String(req.body?.chosenAction || '').trim().slice(0, 160);
    const step = Number(req.body?.step || 1);

    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        ok: false,
        error: 'La clave de IA (GEMINI_API_KEY) no está configurada en el servidor.',
      });
    }

    try {
      const prompt = previousStory
        ? `Continue this interactive children's story (step ${step} of 3) in ${KIDS_LANGUAGE_NAMES[kidsLang]} for ages ${ageGroup}.
Previous narrative: "${previousStory}"
Child's choice: "${chosenAction}"
Continue warmly, end with either a cliffhanger choice (if step < 3) or a joyful conclusion (if step >= 3), plus a tiny 1-question reading comprehension quiz and 1 fun vocabulary word from the story.`
        : `Write Chapter 1 (step 1 of 3) of an interactive, educational children's story in ${KIDS_LANGUAGE_NAMES[kidsLang]} for ages ${ageGroup}.
Main Hero: ${hero}
Setting: ${setting}
Educational Theme / Moral Value: ${moralValue}
Keep sentences warm, vivid, kid-safe, and easy to read aloud. Provide 2 fun choices for how the child continues the adventure, 1 quick comprehension question, 1 featured vocabulary word, and an illustrationScene object describing the visual storybook frame.`;

      const response = await withGeminiRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                chapterText: { type: Type.STRING },
                choiceA: { type: Type.STRING },
                choiceB: { type: Type.STRING },
                vocabularyWord: { type: Type.STRING },
                vocabularyMeaning: { type: Type.STRING },
                quizQuestion: { type: Type.STRING },
                quizOptions: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                correctOptionIndex: { type: Type.INTEGER },
                illustrationScene: {
                  type: Type.OBJECT,
                  properties: {
                    skyTheme: { type: Type.STRING },
                    heroSymbol: { type: Type.STRING },
                    companionSymbol: { type: Type.STRING },
                    settingSymbol: { type: Type.STRING },
                    caption: { type: Type.STRING },
                  },
                  required: ['skyTheme', 'heroSymbol', 'companionSymbol', 'settingSymbol', 'caption'],
                },
              },
              required: [
                'title',
                'chapterText',
                'choiceA',
                'choiceB',
                'vocabularyWord',
                'vocabularyMeaning',
                'quizQuestion',
                'quizOptions',
                'correctOptionIndex',
                'illustrationScene',
              ],
            },
          },
        })
      );

      const story = parseGeminiJson<Record<string, unknown>>(response.text, {});
      res.json({ ok: true, step, story });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn({ errMsg, kidsLang }, 'kids_ai_story_error');
      const mappedErr = formatGeminiRouteError(err, 'Error al crear el cuento mágico con IA.');
      res.status(mappedErr.status).json({ ok: false, error: mappedErr.message });
    }
  });

  // 4. Gemini AI Educational Tutor
  app.post('/api/kids/ai-tutor', async (req: Request, res: Response) => {
    const kidsLang = normalizeKidsLang(req.body?.lang);
    const ageGroup = (String(req.body?.ageGroup || '6-8') as KidsAgeGroup);
    const mode = String(req.body?.mode || 'science_qa').trim();
    const topic = String(req.body?.topic || '').trim().slice(0, 180);
    const question = String(req.body?.question || '').trim().slice(0, 240);
    const targetWord = String(req.body?.targetWord || '').trim().slice(0, 80);

    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        ok: false,
        error: 'La clave de IA (GEMINI_API_KEY) no está configurada en el servidor.',
      });
    }

    try {
      let instruction = '';
      if (mode === 'math_hint') {
        instruction = `You are a friendly primary school math coach speaking ${KIDS_LANGUAGE_NAMES[kidsLang]} to a child aged ${ageGroup}.
The child is solving: "${question || topic}".
Give a gentle, playful visual hint (e.g. counting stars, apples, or groups) WITHOUT spoiling complex steps unnecessarily, and give 1 short encouraging tip.`;
      } else if (mode === 'language_coach') {
        instruction = `You are a warm multilingual kids teacher. Teach a child aged ${ageGroup} how to use the word/phrase "${targetWord || topic}" in ${KIDS_LANGUAGE_NAMES[kidsLang]}.
Provide one ultra-simple example sentence, a phonetic pronunciation tip readable for kids, and a playful 3-option mini challenge question.`;
      } else if (mode === 'quiz_pack') {
        instruction = `Create an educational kids quiz question about "${topic || 'Space, Nature & World'}" for ages ${ageGroup} written completely in ${KIDS_LANGUAGE_NAMES[kidsLang]}.
Provide a short fun explanation, 4 multiple-choice answers (only one correct), and an encouraging celebration line.`;
      } else {
        instruction = `You are Profe IA, a cheerful science & nature guide for kids aged ${ageGroup}, responding in ${KIDS_LANGUAGE_NAMES[kidsLang]}.
Child asks: "${question || topic || 'Why is the sky blue?'}".
Answer in 2-3 vivid, joyful sentences kids love, share 1 surprising fun fact, and ask 1 quick 3-option curiosity quiz to reinforce learning.`;
      }

      const response = await withGeminiRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: instruction,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                explanation: { type: Type.STRING },
                funFact: { type: Type.STRING },
                quizQuestion: { type: Type.STRING },
                quizOptions: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                correctIndex: { type: Type.INTEGER },
                encouragement: { type: Type.STRING },
              },
              required: [
                'explanation',
                'funFact',
                'quizQuestion',
                'quizOptions',
                'correctIndex',
                'encouragement',
              ],
            },
          },
        })
      );

      const tutor = parseGeminiJson<Record<string, unknown>>(response.text, {});
      res.json({ ok: true, tutor });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn({ errMsg, mode, kidsLang }, 'kids_ai_tutor_error');
      const mappedErr = formatGeminiRouteError(err, 'Profe IA no pudo responder ahora mismo.');
      res.status(mappedErr.status).json({ ok: false, error: mappedErr.message });
    }
  });

  // 5. Gemini TTS Pronunciation & Story Read-Aloud
  app.post('/api/kids/tts', async (req: Request, res: Response) => {
    const text = String(req.body?.text || '').trim().slice(0, 650);
    const kidsLang = normalizeKidsLang(req.body?.lang);
    const style = String(req.body?.style || '').trim();

    if (!text) {
      return res.status(400).json({ ok: false, error: 'Texto requerido para audio.' });
    }

    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        ok: false,
        error: 'La clave de IA (GEMINI_API_KEY) no está configurada en el servidor.',
      });
    }

    try {
      void style;
      const response = await withGeminiRetry(() =>
        ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `Read aloud clearly in ${KIDS_LANGUAGE_NAMES[kidsLang]} for children: ${text}`,
                },
              ],
            },
          ],
          config: {
            responseModalities: ['TEXT'],
          },
        })
      );

      const generatedText =
        response.candidates?.[0]?.content?.parts?.[0]?.text || text;
      if (!generatedText) {
        return res.status(502).json({ ok: false, error: 'No response generated' });
      }

      res.json({
        ok: false,
        text: generatedText,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn({ errMsg, kidsLang }, 'kids_tts_fallback_active');
      return res.json({ ok: false, text });
    }
  });

  // 6. Gemini 8-Language Visual Word Translator for Kids
  app.post('/api/kids/ai-translate-word', async (req: Request, res: Response) => {
    const word = String(req.body?.word || '').trim().slice(0, 80);
    if (!word) {
      return res.status(400).json({ ok: false, error: 'Palabra requerida.' });
    }

    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        ok: false,
        error: 'La clave de IA (GEMINI_API_KEY) no está configurada en el servidor.',
      });
    }

    try {
      const langFieldSchema = {
        type: Type.OBJECT,
        properties: {
          word: { type: Type.STRING },
          phonetic: { type: Type.STRING },
        },
        required: ['word', 'phonetic'],
      };

      const response = await withGeminiRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `Translate the kid-friendly word or short phrase "${word}" into all 8 languages with simple readable phonetic pronunciation for children and choose the best matching iconId from: cat, dog, bird, sun, moon, star, water, tree, flower, apple, bread, family, house, car, book.
Languages required:
- es: Spanish
- ca: Catalan
- en: English
- nl: Belgian Dutch / Vlaams
- fr: French
- ar: Arabic (script + simple transliteration or kid-friendly form)
- rif: Authentic everyday spoken Riffian Berber (Tarifit n Arrif, never artificial standard Tamazight neologisms)
- zh: Simplified Mandarin Chinese with pinyin`,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                iconId: { type: Type.STRING },
                translations: {
                  type: Type.OBJECT,
                  properties: {
                    es: langFieldSchema,
                    ca: langFieldSchema,
                    en: langFieldSchema,
                    nl: langFieldSchema,
                    fr: langFieldSchema,
                    ar: langFieldSchema,
                    rif: langFieldSchema,
                    zh: langFieldSchema,
                  },
                  required: ['es', 'ca', 'en', 'nl', 'fr', 'ar', 'rif', 'zh'],
                },
              },
              required: ['iconId', 'translations'],
            },
          },
        })
      );

      const entry = parseGeminiJson<{
        iconId?: string;
        translations?: Record<KidsLanguageCode, { word: string; phonetic: string }>;
      }>(response.text, {});

      if (!entry?.translations) {
        return res.status(502).json({ ok: false, error: 'Respuesta incompleta del traductor IA.' });
      }
      const allowedIcons = new Set([
        'cat', 'dog', 'bird', 'sun', 'moon', 'star', 'water', 'tree',
        'flower', 'apple', 'bread', 'family', 'house', 'car', 'book',
      ]);
      const safeIconId = entry.iconId && allowedIcons.has(entry.iconId) ? entry.iconId : 'star';
      res.json({
        ok: true,
        translations: entry.translations,
        entry: {
          id: `custom-${Date.now()}`,
          category: 'family',
          iconId: safeIconId,
          translations: entry.translations,
        },
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn({ errMsg, word }, 'kids_ai_translate_word_error');
      const mappedErr = formatGeminiRouteError(err, 'No se pudo traducir esa palabra ahora.');
      res.status(mappedErr.status).json({ ok: false, error: mappedErr.message });
    }
  });
}
