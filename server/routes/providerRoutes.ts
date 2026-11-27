import type express from 'express';
import { registerProvidersRoutes } from './providersRoutes.ts';

export function registerProviderRoutes(
  app: express.Application,
  opts: { getPublicOrigin: (req: express.Request) => string }
): void {
  registerProvidersRoutes(app, opts);
}
