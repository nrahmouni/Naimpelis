import type express from 'express';
import { logger } from '../utils/logger.ts';

export function securityHeadersMiddleware(
  _req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=*, geolocation=()');
  next();
}

export function applyPublicCacheHeaders(
  res: express.Response,
  maxAgeSec = 300,
  staleWhileRevalidateSec = 900
): void {
  res.setHeader(
    'Cache-Control',
    `public, max-age=${maxAgeSec}, stale-while-revalidate=${staleWhileRevalidateSec}`
  );
}

export function expressErrorHandler(
  err: unknown,
  req: express.Request,
  res: express.Response,
  _next: express.NextFunction
): void {
  logger.error({ err, path: req.path, method: req.method }, 'express_request_error');
  if (res.headersSent) return;
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
  });
}
