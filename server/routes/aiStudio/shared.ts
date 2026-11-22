import { GoogleGenAI } from '@google/genai';
import type { Response } from 'express';
import { logger } from '../../utils/logger.ts';
import { runtimeMetrics } from '../../services/runtimeMetricsCollector.ts';

export type AllowedChatModel =
  | 'gemini-4-hydrogen'
  | 'gemini-4-argon'
  | 'gemini-4-carbon'
  | 'gemini-3.1-flash-lite';

export const ALLOWED_CHAT_MODELS = new Set<AllowedChatModel>([
  'gemini-4-hydrogen',
  'gemini-4-argon',
  'gemini-4-carbon',
  'gemini-3.1-flash-lite',
]);

// Per-model temporary cooldown when a model hits 429 quota or 503 overload
const MODEL_COOLDOWN_UNTIL = new Map<string, number>();

export function clearAiModelCooldowns(): void {
  MODEL_COOLDOWN_UNTIL.clear();
}

function isModelInCooldown(model: string): boolean {
  const until = MODEL_COOLDOWN_UNTIL.get(model);
  if (!until) return false;
  if (Date.now() >= until) {
    MODEL_COOLDOWN_UNTIL.delete(model);
    return false;
  }
  return true;
}

function markModelCooldown(model: string, err: unknown): void {
  const details = extractErrorDetails(err);
  const ttlMs = details.code === 'QUOTA_EXCEEDED' ? 60_000 : 35_000;
  MODEL_COOLDOWN_UNTIL.set(model, Date.now() + ttlMs);
}

export function getGenAiClient(): GoogleGenAI {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no está configurada en el servidor.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function extractErrorDetails(err: unknown): {
  status: number;
  code: string;
  message: string;
} {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null
        ? JSON.stringify(err)
        : String(err || 'Error desconocido');
  const statusFromErr =
    typeof (err as { status?: unknown })?.status === 'number'
      ? (err as { status: number }).status
      : 0;

  if (/spending\s*cap|ai\.studio\/spend/i.test(msg)) {
    return {
      status: 429,
      code: 'SPENDING_CAP_EXCEEDED',
      message:
        'El proyecto ha alcanzado su límite mensual de gasto en AI Studio. Gestiona el presupuesto en https://ai.studio/spend para reactivar la IA.',
    };
  }
  if (statusFromErr === 429 || /429|RESOURCE_EXHAUSTED|quota|rate\s*limit/i.test(msg)) {
    return {
      status: 429,
      code: 'QUOTA_EXCEEDED',
      message:
        'Cuota temporal agotada en la API de Gemini. Espera unos segundos o revisa tus límites en AI Studio.',
    };
  }
  if (
    statusFromErr === 403 ||
    statusFromErr === 401 ||
    /403|PERMISSION_DENIED|API_KEY_INVALID|401/i.test(msg)
  ) {
    return {
      status: 403,
      code: 'API_KEY_ERROR',
      message: 'Clave API inválida o sin permisos configurados para este modelo.',
    };
  }
  if (
    statusFromErr === 503 ||
    /503|UNAVAILABLE|high demand|overloaded|service unavailable/i.test(msg)
  ) {
    return {
      status: 503,
      code: 'MODEL_UNAVAILABLE',
      message:
        'El motor de IA tiene un pico temporal de demanda. Vuelve a intentarlo en unos segundos.',
    };
  }
  if (/GEMINI_API_KEY no está configurada/i.test(msg)) {
    return { status: 500, code: 'MISSING_API_KEY', message: msg };
  }
  return { status: 500, code: 'INTERNAL_ERROR', message: msg.slice(0, 260) };
}

export function isAiFallbackEligibleError(err: unknown): boolean {
  const details = extractErrorDetails(err);
  return (
    details.code === 'QUOTA_EXCEEDED' ||
    details.code === 'SPENDING_CAP_EXCEEDED' ||
    details.code === 'MODEL_UNAVAILABLE' ||
    details.code === 'MISSING_API_KEY' ||
    details.code === 'API_KEY_ERROR'
  );
}

export function isTransientAiCapacityError(err: unknown): boolean {
  const details = extractErrorDetails(err);
  if (details.code === 'SPENDING_CAP_EXCEEDED' || details.code === 'API_KEY_ERROR' || details.code === 'MISSING_API_KEY') {
    return false;
  }
  if (details.code === 'QUOTA_EXCEEDED' || details.code === 'MODEL_UNAVAILABLE') {
    return true;
  }
  const statusFromErr =
    typeof (err as { status?: unknown })?.status === 'number'
      ? (err as { status: number }).status
      : 0;
  if (statusFromErr === 502 || statusFromErr === 504) return true;
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null
        ? JSON.stringify(err)
        : String(err || '');
  return /ECONNRESET|ETIMEDOUT|socket hang up/i.test(msg);
}

const waitMs = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function buildModelCascade(primaryModel: string): string[] {
  const baseOrder =
    primaryModel === 'gemini-3.1-flash-lite'
      ? ['gemini-3.1-flash-lite', 'gemini-4-argon', 'gemini-4-hydrogen']
      : primaryModel === 'gemini-4-argon'
        ? ['gemini-4-argon', 'gemini-3.1-flash-lite', 'gemini-4-hydrogen']
        : ['gemini-4-hydrogen', 'gemini-3.1-flash-lite', 'gemini-4-argon'];

  const deduped = Array.from(new Set(baseOrder));
  const healthy = deduped.filter((m) => !isModelInCooldown(m));
  return healthy.length > 0 ? healthy : deduped;
}

function adaptConfigForModel(
  model: string,
  config: Parameters<GoogleGenAI['models']['generateContent']>[0]['config']
): Parameters<GoogleGenAI['models']['generateContent']>[0]['config'] {
  if (!config || model !== 'gemini-3.1-flash-lite') return config;
  const copy = { ...(config as Record<string, unknown>) };
  if ('thinkingConfig' in copy) {
    delete copy.thinkingConfig;
  }
  return copy as Parameters<GoogleGenAI['models']['generateContent']>[0]['config'];
}

export async function generateContentWithResilience(
  ai: GoogleGenAI,
  params: Parameters<GoogleGenAI['models']['generateContent']>[0]
) {
  let lastError: unknown;
  const cascade = buildModelCascade(params.model);

  for (let i = 0; i < cascade.length; i++) {
    const candidateModel = cascade[i];
    const adaptedConfig = adaptConfigForModel(candidateModel, params.config);

    // Give the initial model one quick retry on transient 503 network glitches,
    // but immediately cascade to the next model on 429 quota exhaustion.
    const attemptsForModel = i === 0 ? 2 : 1;
    for (let attempt = 0; attempt < attemptsForModel; attempt++) {
      try {
        if (i > 0) {
          logger.warn(
            { primaryModel: params.model, fallbackModel: candidateModel },
            'gemini_model_cascade_triggered'
          );
        }
        const response = await ai.models.generateContent({
          ...params,
          model: candidateModel,
          config: adaptedConfig,
        });
        runtimeMetrics.recordAiOutcome('ok');
        return response;
      } catch (err) {
        lastError = err;
        const details = extractErrorDetails(err);
        if (details.status === 429) runtimeMetrics.recordAiOutcome('429');
        else if (details.status === 503) runtimeMetrics.recordAiOutcome('503');
        if (details.code === 'SPENDING_CAP_EXCEEDED' || details.code === 'API_KEY_ERROR') {
          throw err;
        }
        if (details.code === 'QUOTA_EXCEEDED') {
          markModelCooldown(candidateModel, err);
          break; // Immediately switch to next model in cascade instead of retrying exhausted model
        }
        if (!isTransientAiCapacityError(err)) {
          throw err;
        }
        if (attempt + 1 < attemptsForModel) {
          await waitMs(350);
        } else {
          markModelCooldown(candidateModel, err);
        }
      }
    }
  }

  throw lastError;
}

export function parseGeminiJson<T = Record<string, unknown>>(rawText: string, fallback: T): T {
  try {
    const trimmed = String(rawText || '').trim();
    if (!trimmed) return fallback;
    const stripped = trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    return JSON.parse(stripped) as T;
  } catch {
    return fallback;
  }
}

const aiRateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkAiIpRateLimit(
  ipRaw: string,
  limit = 45,
  windowMs = 60_000
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const key = ipRaw || 'unknown';
  if (aiRateLimitMap.size > 1000) {
    for (const [k, v] of aiRateLimitMap.entries()) {
      if (now >= v.resetAt) aiRateLimitMap.delete(k);
    }
  }
  const entry = aiRateLimitMap.get(key);
  if (!entry || now >= entry.resetAt) {
    aiRateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }
  entry.count += 1;
  if (entry.count > limit) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

export function sendAiEndpointError(res: Response, routeTag: string, err: unknown): void {
  const details = extractErrorDetails(err);
  if (details.status === 429 || details.status === 403 || details.status === 503) {
    logger.warn(
      { status: details.status, code: details.code, detail: details.message },
      `${routeTag}_limit`
    );
  } else {
    logger.error({ err }, `${routeTag}_error`);
  }
  res.status(details.status).json({ ok: false, code: details.code, error: details.message });
}
