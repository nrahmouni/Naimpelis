/**
 * @module server/routes/movieReelsRoutes
 * @description API endpoints for the adaptive vertical TikTok-style Movie & Series discovery feed.
 */
import type { Express } from 'express';
import {
  buildAdaptiveMovieReelsFeed,
  generateReelHostDeepDive,
  type ReelsContentMode,
  type ReelsMoodFilter,
} from '../services/movieReelsService.ts';
import { logger } from '../utils/logger.ts';

export function registerMovieReelsRoutes(app: Express): void {
  app.post('/api/reels/feed', async (req, res) => {
    try {
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<
        string,
        unknown
      >;
      const validMoods = new Set<ReelsMoodFilter>([
        'para_ti',
        'estrenos',
        'accion',
        'thriller',
        'scifi',
        'comedia',
        'series',
      ]);
      const moodRaw = String(body.mood || 'para_ti') as ReelsMoodFilter;
      const mood: ReelsMoodFilter = validMoods.has(moodRaw) ? moodRaw : 'para_ti';

      const contentModeRaw = String(body.contentMode || 'all');
      const contentMode: ReelsContentMode =
        contentModeRaw === 'trailers' || contentModeRaw === 'scenes'
          ? contentModeRaw
          : 'all';

      const result = await buildAdaptiveMovieReelsFeed({
        likedIds: Array.isArray(body.likedIds) ? body.likedIds.map(String).slice(0, 120) : [],
        dislikedIds: Array.isArray(body.dislikedIds)
          ? body.dislikedIds.map(String).slice(0, 120)
          : [],
        seenIds: Array.isArray(body.seenIds) ? body.seenIds.map(String).slice(0, 180) : [],
        likedGenres: Array.isArray(body.likedGenres)
          ? body.likedGenres.map(Number).filter((n) => Number.isFinite(n)).slice(0, 12)
          : [],
        dislikedGenres: Array.isArray(body.dislikedGenres)
          ? body.dislikedGenres.map(Number).filter((n) => Number.isFinite(n)).slice(0, 12)
          : [],
        likedTitles: Array.isArray(body.likedTitles)
          ? body.likedTitles.map(String).slice(0, 20)
          : [],
        seedItems: Array.isArray(body.seedItems)
          ? body.seedItems
              .filter((s) => s && typeof s === 'object')
              .map((s: any) => ({
                tmdbId: Number(s.tmdbId || 0),
                mediaType: (s.mediaType === 'tv' ? 'tv' : 'movie') as 'movie' | 'tv',
                title: typeof s.title === 'string' ? s.title : undefined,
              }))
              .filter((s) => s.tmdbId > 0)
              .slice(0, 4)
          : [],
        mood,
        contentMode,
        lang: typeof body.lang === 'string' ? body.lang : 'es',
        limit: Number(body.limit || 7),
      });

      res.json({ success: true, ...result });
    } catch (err) {
      logger.warn({ err }, 'movie_reels_feed_error');
      res.status(500).json({
        success: false,
        error: 'No se pudo cargar el feed de clips en este momento.',
      });
    }
  });

  app.post('/api/reels/insight', async (req, res) => {
    try {
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<
        string,
        unknown
      >;
      const title = String(body.title || '').trim();
      if (!title) {
        return res.status(400).json({ success: false, error: 'Missing title' });
      }
      const mediaType = body.mediaType === 'tv' ? 'tv' : 'movie';
      const result = await generateReelHostDeepDive({
        title,
        mediaType,
        year: typeof body.year === 'string' ? body.year : undefined,
        genres: Array.isArray(body.genres) ? body.genres.map(String).slice(0, 5) : [],
        overview: typeof body.overview === 'string' ? body.overview : undefined,
        question: typeof body.question === 'string' ? body.question : undefined,
        likedTitles: Array.isArray(body.likedTitles) ? body.likedTitles.map(String).slice(0, 8) : [],
      });
      res.json({ success: true, ...result });
    } catch (err) {
      logger.warn({ err }, 'movie_reels_insight_error');
      res.status(500).json({ success: false, error: 'Error consultando al presentador.' });
    }
  });
}
