import type express from 'express';
import { logger } from '../utils/logger.ts';

export function securityHeadersMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=*, geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'on');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' https: data: blob: ws: wss: 'unsafe-inline' 'unsafe-eval'; object-src 'none'; base-uri 'self'; frame-ancestors 'self' https://aistudio.google.com https://*.google.com https://*.googleusercontent.com https://*.run.app;"
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

export function applyEdgeCacheHeaders(
  res: express.Response,
  edgeMaxAgeSec = 60,
  browserMaxAgeSec = 20,
  staleWhileRevalidateSec = 180
): void {
  res.setHeader(
    'Cache-Control',
    `public, max-age=${browserMaxAgeSec}, s-maxage=${edgeMaxAgeSec}, stale-while-revalidate=${staleWhileRevalidateSec}`
  );
  res.setHeader(
    'CDN-Cache-Control',
    `public, s-maxage=${edgeMaxAgeSec}, stale-while-revalidate=${staleWhileRevalidateSec}`
  );
}

interface RateBucket {
  count: number;
  resetAt: number;
}

export interface SlidingRateLimiterOptions {
  maxRequests: number;
  windowMs: number;
  keyPrefix?: string;
}

export function createSlidingWindowRateLimiter(options: SlidingRateLimiterOptions) {
  const buckets = new Map<string, RateBucket>();
  const { maxRequests, windowMs, keyPrefix = 'api' } = options;

  const pruneExpired = (now: number) => {
    if (buckets.size < 2500) return;
    for (const [k, v] of buckets.entries()) {
      if (now >= v.resetAt) buckets.delete(k);
    }
  };

  return function rateLimitMiddleware(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ): void {
    const now = Date.now();
    pruneExpired(now);

    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const clientIp = forwarded || req.ip || 'unknown';
    const key = `${keyPrefix}:${clientIp}`;
    let bucket = buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    const remaining = Math.max(0, maxRequests - bucket.count);
    res.setHeader('X-RateLimit-Limit', String(maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > maxRequests) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        success: false,
        error: 'Rate limit exceeded. Please retry shortly.',
        retryAfterSec,
      });
      return;
    }
    next();
  };
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
