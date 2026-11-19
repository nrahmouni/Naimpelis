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
    const summary = await runRefreshCycle();
    res.json({ success: true, summary, status: getCatalogRefreshStatus() });
  });

  app.get('/api/catalog/tv/:tmdbId/languages', handleTvLanguagesRequest);
}
