import type { Express } from 'express';
import { registerAiMediaRoutes } from './aiStudio/aiMediaRoutes.ts';
import { registerStudioPersistenceRoutes } from './aiStudio/studioPersistenceRoutes.ts';

export function registerAiStudioRoutes(app: Express): void {
  registerAiMediaRoutes(app);
  registerStudioPersistenceRoutes(app);
}
