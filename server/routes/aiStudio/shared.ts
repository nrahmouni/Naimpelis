import { GoogleGenAI } from '@google/genai';
import type { Response } from 'express';
import { logger } from '../../utils/logger.ts';

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
  if (/GEMINI_API_KEY no está configurada/i.test(msg)) {
    return { status: 500, code: 'MISSING_API_KEY', message: msg };
  }
  return { status: 500, code: 'INTERNAL_ERROR', message: msg.slice(0, 260) };
}

export function sendAiEndpointError(res: Response, routeTag: string, err: unknown): void {
  const details = extractErrorDetails(err);
  if (details.status === 429 || details.status === 403) {
    logger.warn(
      { status: details.status, code: details.code, detail: details.message },
      `${routeTag}_limit`
    );
  } else {
    logger.error({ err }, `${routeTag}_error`);
  }
  res.status(details.status).json({ ok: false, code: details.code, error: details.message });
}
