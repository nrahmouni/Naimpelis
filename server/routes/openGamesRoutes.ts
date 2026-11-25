/**
 * @module server/routes/openGamesRoutes
 * @description Exposes MIT-licensed ready-to-play open-source HTML5 game catalog API.
 */
import type { Express } from 'express';
import { getOpenGamesRepoCatalog } from '../services/openGamesRepoService.ts';

export function registerOpenGamesRoutes(app: Express): void {
  app.get('/api/games/open-catalog', async (req, res) => {
    const force = req.query.refresh === '1';
    const category = String(req.query.category || '').trim().toLowerCase();
    const q = String(req.query.q || '').trim().toLowerCase();

    const catalog = await getOpenGamesRepoCatalog(force);
    let games = catalog.games;
    if (category && category !== 'all') {
      games = games.filter((g) => g.category.toLowerCase() === category);
    }
    if (q) {
      games = games.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.description.toLowerCase().includes(q) ||
          g.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    res.setHeader('Cache-Control', 'public, max-age=600');
    res.json({
      success: true,
      repo: catalog.repo,
      repoUrl: catalog.repoUrl,
      license: catalog.license,
      total: games.length,
      fullTotal: catalog.total,
      categories: catalog.categories,
      games,
    });
  });
}
