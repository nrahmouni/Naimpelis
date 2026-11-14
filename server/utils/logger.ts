import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'info'),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.pin',
      '*.pinCode',
      '*.tvAuthToken',
      '*.password',
      '*.token',
    ],
    censor: '[REDACTED]',
  },
  base: {
    service: 'naim-cine-engine',
  },
});
