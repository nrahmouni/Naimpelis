import type express from 'express';
import { sendApkPackageResponse } from './catalog/apkDownloadHelper.ts';
import {
  seriesCatalogCache,
  seriesCatalogStaleCache,
  handleSeriesCatalogRequest,
} from './catalog/seriesCatalogHandler.ts';
import { handleTvDetailsRequest } from './catalog/tvDetailsHandler.ts';
import {
  handleMoviesCatalogRequest,
  handleVestCatalogRequest,
  handleBingetrixCatalogRequest,
  handleTvLanguagesRequest,
  getCatalogRefreshStatus,
  runRefreshCycle,
} from './catalog/moviesAndBingetrixHandler.ts';

export {
  seriesCatalogCache,
  seriesCatalogStaleCache,
  sendApkPackageResponse,
  handleSeriesCatalogRequest,
  handleTvDetailsRequest,
};

let lastCatalogRefreshAt = 0;
let inflightCatalogRefresh: Promise<unknown> | null = null;
const CATALOG_REFRESH_COOLDOWN_MS = 15_000;

export function registerVodCatalogRoutes(app: express.Express) {
  app.get('/api/catalog/movies', handleMoviesCatalogRequest);
  app.get('/api/catalog/vest', handleVestCatalogRequest);
  app.get('/api/catalog/bingetrix', handleBingetrixCatalogRequest);

  app.get('/api/catalog/refresh-status', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, ...getCatalogRefreshStatus() });
  });

  app.post('/api/catalog/refresh', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const now = Date.now();
    if (inflightCatalogRefresh) {
      const summary = await inflightCatalogRefresh;
      return res.json({ success: true, summary, status: getCatalogRefreshStatus(), deduped: true });
    }
    const elapsed = now - lastCatalogRefreshAt;
    if (lastCatalogRefreshAt > 0 && elapsed < CATALOG_REFRESH_COOLDOWN_MS) {
      const retryAfterSec = Math.ceil((CATALOG_REFRESH_COOLDOWN_MS - elapsed) / 1000);
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        success: false,
        error: `Espera ${retryAfterSec}s antes de refrescar de nuevo.`,
        retryAfterSec,
        status: getCatalogRefreshStatus(),
      });
    }
    lastCatalogRefreshAt = now;
    inflightCatalogRefresh = runRefreshCycle().finally(() => {
      inflightCatalogRefresh = null;
    });
    const summary = await inflightCatalogRefresh;
    return res.json({ success: true, summary, status: getCatalogRefreshStatus() });
  });

  app.get('/api/catalog/tv/:tmdbId/languages', handleTvLanguagesRequest);
}
