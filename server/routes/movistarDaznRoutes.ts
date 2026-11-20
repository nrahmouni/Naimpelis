import type { Express } from 'express';
import {
  getMovistarDaznHome,
  getMovistarDaznProgramDetail,
  resolveMovistarDaznPlayVideo,
} from '../services/movistarDaznCatalogService.ts';

export function registerMovistarDaznRoutes(app: Express): void {
  app.get('/api/movistar-dazn/home', async (_req, res) => {
    try {
      const data = await getMovistarDaznHome();
      res.json({ success: true, ...data });
    } catch (err) {
      res.status(500).json({
        success: false,
        error:
          err instanceof Error
            ? err.message
            : 'Error cargando el catálogo de DAZN y Movistar Plus+',
      });
    }
  });

  app.get('/api/movistar-dazn/program/:programId', async (req, res) => {
    try {
      const programId = String(req.params.programId || '').trim();
      const titleHint = String(req.query.title || '').trim();
      if (!programId) {
        return res.status(400).json({ success: false, error: 'programId requerido' });
      }
      const data = await getMovistarDaznProgramDetail(programId, titleHint);
      res.json({ success: true, ...data });
    } catch (err) {
      res.status(500).json({
        success: false,
        error:
          err instanceof Error
            ? err.message
            : 'Error cargando episodios del programa',
      });
    }
  });

  app.get('/api/movistar-dazn/play-video', async (req, res) => {
    try {
      const source = String(req.query.source || '').trim();
      const id = String(req.query.id || '').trim();
      const programTitle = String(req.query.programTitle || '').trim();
      const episodeTitle = String(req.query.episodeTitle || '').trim();
      const result = await resolveMovistarDaznPlayVideo({
        source,
        id,
        programTitle,
        episodeTitle,
      });
      if (!result.success) {
        return res.status(404).json(result);
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({
        success: false,
        error:
          err instanceof Error ? err.message : 'Error resolviendo el vídeo seleccionado',
      });
    }
  });
}
