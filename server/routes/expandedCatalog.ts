import type express from 'express';
import {
  discoverExpandedCatalog,
  EXPANDED_GENRES,
  FAST_THEMATIC_CHANNELS,
  getEditorialCollections,
  getLatestCinemaAndSeasons,
} from '../services/catalogDiscoveryService.ts';
import { logger } from '../utils/logger.ts';

export function registerExpandedCatalogRoutes(app: express.Express): void {
  // Curated collections + genre metadata
  app.get('/api/catalog/collections', async (req, res) => {
    try {
      const lang = String(req.query.lang || 'es').toLowerCase();
      const collections = await getEditorialCollections(lang);
      res.setHeader('Cache-Control', 'public, max-age=180');
      res.json({
        success: true,
        collections,
        genres: EXPANDED_GENRES,
      });
    } catch (err) {
      logger.warn({ err }, 'expanded_collections_error');
      res.status(500).json({
        success: false,
        collections: [],
        genres: EXPANDED_GENRES,
      });
    }
  });

  // Advanced Multi-Filter Discovery (Genre + Provider + Rating + Year + Sort)
  app.get('/api/catalog/discover', async (req, res) => {
    try {
      const mediaType = req.query.mediaType === 'tv' ? 'tv' : 'movie';
      const genreId = parseInt(String(req.query.genreId || '0'), 10) || undefined;
      const provider = String(req.query.provider || 'all').toLowerCase();
      const sort = String(req.query.sort || 'popularity.desc');
      const year = String(req.query.year || '').trim() || undefined;
      const minRating = parseFloat(String(req.query.minRating || '0')) || undefined;
      const lang = String(req.query.lang || 'es').toLowerCase();
      const page = parseInt(String(req.query.page || '1'), 10) || 1;

      const result = await discoverExpandedCatalog({
        mediaType,
        genreId,
        provider,
        sort,
        year,
        minRating,
        lang,
        page,
      });

      res.setHeader('Cache-Control', 'public, max-age=120');
      res.json({
        success: true,
        items: result.items,
        hasMore: result.hasMore,
        page: result.page,
      });
    } catch (err) {
      logger.warn({ err }, 'expanded_discover_error');
      res.status(500).json({ success: false, items: [], hasMore: false, page: 1 });
    }
  });

  // 24/7 Thematic FAST Channels (Live News, Sports, NASA, Music, Anime)
  app.get('/api/catalog/fast-channels', (req, res) => {
    const category = String(req.query.category || 'all').toLowerCase();
    const channels =
      category === 'all'
        ? FAST_THEMATIC_CHANNELS
        : FAST_THEMATIC_CHANNELS.filter((c) => c.category === category);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({
      success: true,
      channels,
    });
  });

  // Latest Cinema Releases (Cartelera) & Newly Released TV Seasons
  app.get('/api/catalog/latest-releases', async (req, res) => {
    try {
      const lang = String(req.query.lang || 'es').toLowerCase();
      const data = await getLatestCinemaAndSeasons(lang);
      res.setHeader('Cache-Control', 'public, max-age=180');
      res.json({
        success: true,
        ...data,
      });
    } catch (err) {
      logger.warn({ err }, 'latest_releases_error');
      res.status(500).json({
        success: false,
        cinemaReleases: [],
        newSeasons: [],
        updatedAt: Date.now(),
      });
    }
  });
}
