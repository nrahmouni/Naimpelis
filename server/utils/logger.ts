import pino from 'pino';

export function maskSensitiveText(val: unknown): unknown {
  if (typeof val !== 'string') return val;
  return val
    .replace(
      /([?&](?:pass|password|pwd|access_token|refresh_token|client_secret|token|api_key|apikey|key|secret)=)[^&\s]+/gi,
      '$1[REDACTED]'
    )
    .replace(
      /(https?:\/\/[^/\s]+\/(?:live|movie|series|timeshift)\/)([^/\s]+)\/([^/\s]+)(\/)/gi,
      '$1[REDACTED]/[REDACTED]$4'
    )
    .replace(/(Authorization:\s*Bearer\s+)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/\b([a-zA-Z0-9._%+-]{2})[a-zA-Z0-9._%+-]*@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '$1***@$2');
}

function sanitizeRecord(obj: Record<string, unknown>, depth = 0): Record<string, unknown> {
  if (depth > 3) return obj;
  const copy: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') {
      copy[k] = maskSensitiveText(v);
    } else if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Error)) {
      copy[k] = sanitizeRecord(v as Record<string, unknown>, depth + 1);
    } else {
      copy[k] = v;
    }
  }
  return copy;
}

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-api-key"]',
      '*.pin',
      '*.pinCode',
      '*.tvAuthToken',
      '*.password',
      '*.pass',
      '*.pwd',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
      '*.clientSecret',
      '*.secret',
      '*.email',
    ],
    censor: '[REDACTED]',
  },
  hooks: {
    logMethod(args, method) {
      const sanitized = args.map((arg) => {
        if (typeof arg === 'string') return maskSensitiveText(arg);
        if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
          return sanitizeRecord(arg as Record<string, unknown>);
        }
        return arg;
      });
      return method.apply(this, sanitized as Parameters<typeof method>);
    },
  },
  base: {
    service: 'naim-cine-engine',
  },
});
