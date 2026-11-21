/**
 * @module server/routes/chiringuitoRoutes
 * @description API endpoints for live El Chiringuito de Jugones & Chiringuito Inside resolution.
 */
import type { Express } from 'express';
import {
  MEGA_CHIRINGUITO_FAST_URL,
  MEGA_CHIRINGUITO_TV_URL,
  resolveChiringuitoLiveStream,
} from '../services/chiringuitoLiveService.ts';

export function registerChiringuitoRoutes(app: Express): void {
  app.get('/api/sports/chiringuito-live', async (req, res) => {
    const prefer = req.query.prefer === 'inside' ? 'inside' : 'live';
    const matchHint = typeof req.query.match === 'string' ? req.query.match.trim() : '';
    const forceRefresh = req.query.refresh === '1';

    try {
      const resolution = await resolveChiringuitoLiveStream({
        prefer,
        matchHint,
        forceRefresh,
      });
      res.setHeader('Cache-Control', 'no-cache');
      return res.json(resolution);
    } catch {
      return res.json({
        success: true,
        preferredMode: prefer,
        isLiveNow: false,
        sourceKind: 'mega_tdt',
        activeStream: null,
        insideStream: null,
        mainStream: null,
        candidates: [],
        megaTdtUrl: MEGA_CHIRINGUITO_TV_URL,
        megaFastUrl: MEGA_CHIRINGUITO_FAST_URL,
        checkedAt: Date.now(),
      });
    }
  });
}
