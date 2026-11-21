import pino from 'pino';

function maskSensitiveText(val: unknown): unknown {
  if (typeof val !== 'string') return val;
  return val
    .replace(/([?&](?:pass|password|pwd|access_token|refresh_token|client_secret|token)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/(https?:\/\/[^/\s]+\/(?:live|movie|series)\/)([^/\s]+)\/([^/\s]+)(\/)/gi, '$1[REDACTED]/[REDACTED]$4');
}

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
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
    ],
    censor: '[REDACTED]',
  },
  hooks: {
    logMethod(args, method) {
      const sanitized = args.map((arg) => {
        if (typeof arg === 'string') return maskSensitiveText(arg);
        if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
          const copy: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(arg as Record<string, unknown>)) {
            copy[k] = typeof v === 'string' ? maskSensitiveText(v) : v;
          }
          return copy;
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
