import type express from 'express';
import { logger } from '../utils/logger.ts';

export function securityHeadersMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=*, geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' https: data: blob: ws: wss: 'unsafe-inline' 'unsafe-eval'; object-src 'none'; base-uri 'self'; frame-ancestors 'self';"
  );
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
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
