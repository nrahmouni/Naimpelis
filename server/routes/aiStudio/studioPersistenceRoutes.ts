import type { Express, Request, Response } from 'express';
import { requireAuth, optionalAuth, type AuthenticatedRequest } from '../../../src/middleware/auth.ts';
import {
  deleteUserCreation,
  deleteUserSavedPlace,
  insertGameScore,
  insertUserCreation,
  listGameLeaderboard,
  listUserCreations,
  listUserSavedPlaces,
  upsertUserSavedPlace,
} from '../../../src/db/repository.ts';
import { isCloudSqlConfigured } from '../../../src/db/index.ts';
import { logger } from '../../utils/logger.ts';
import { getMapsServerApiKey } from './shared.ts';

export function registerStudioPersistenceRoutes(app: Express): void {
  // GOOGLE PLACES API (NEW) TEXT SEARCH PROXY (avoids browser CORS)
  app.post('/api/places/cinemas', async (req: Request, res: Response) => {
    try {
      const apiKey = getMapsServerApiKey();
      if (!apiKey) {
        res.status(500).json({ ok: false, error: 'Google Maps API Key no configurada.' });
        return;
      }

      const body = (req.body || {}) as {
        query?: string;
        lat?: number;
        lng?: number;
        radiusMeters?: number;
        lang?: string;
      };
      const textQuery = String(body.query || 'Cine IMAX').trim();
      const languageCode = body.lang === 'en' ? 'en' : body.lang === 'ca' ? 'ca' : 'es';

      const payload: Record<string, unknown> = { textQuery, languageCode, maxResultCount: 12 };
      if (
        typeof body.lat === 'number' &&
        typeof body.lng === 'number' &&
        Number.isFinite(body.lat) &&
        Number.isFinite(body.lng)
      ) {
        payload.locationBias = {
          circle: {
            center: { latitude: body.lat, longitude: body.lng },
            radius: Math.min(Math.max(Number(body.radiusMeters) || 25000, 1000), 50000),
          },
        };
      }

      const upstream = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask':
            'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.googleMapsUri,places.primaryTypeDisplayName,places.currentOpeningHours.openNow',
        },
        body: JSON.stringify(payload),
      });

      const raw = (await upstream.json().catch(() => ({}))) as {
        places?: Array<{
          id?: string;
          displayName?: { text?: string };
          formattedAddress?: string;
          location?: { latitude?: number; longitude?: number };
          rating?: number;
          userRatingCount?: number;
          googleMapsUri?: string;
          primaryTypeDisplayName?: { text?: string };
          currentOpeningHours?: { openNow?: boolean };
        }>;
        error?: { message?: string; status?: string };
      };

      if (!upstream.ok) {
        const errText = raw.error?.message || `HTTP ${upstream.status}`;
        const isQuota =
          upstream.status === 429 || /RESOURCE_EXHAUSTED|OverQuota|quota/i.test(errText);
        res.status(isQuota ? 429 : upstream.status).json({
          ok: false,
          quotaExceeded: isQuota,
          error: isQuota ? 'Cuota de Google Places temporalmente agotada.' : errText,
        });
        return;
      }

      const places = (raw.places || [])
        .filter((p) => p.id && p.location?.latitude != null && p.location?.longitude != null)
        .map((p) => ({
          placeId: p.id!,
          name: p.displayName?.text || 'Lugar de cine',
          formattedAddress: p.formattedAddress || '',
          lat: p.location!.latitude!,
          lng: p.location!.longitude!,
          rating: p.rating ?? null,
          userRatingCount: p.userRatingCount ?? 0,
          googleMapsUri: p.googleMapsUri || `https://www.google.com/maps/place/?q=place_id:${p.id}`,
          category: p.primaryTypeDisplayName?.text || 'Cine',
          openNow: typeof p.currentOpeningHours?.openNow === 'boolean' ? p.currentOpeningHours.openNow : null,
        }));

      res.json({ ok: true, places });
    } catch (err) {
      logger.error({ err }, 'places_search_error');
      res.status(500).json({ ok: false, error: 'Error consultando Google Places.' });
    }
  });

  // CLOUD SQL PERSISTENCE: USER AI STUDIO CREATIONS
  app.get('/api/studio/creations', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!isCloudSqlConfigured()) {
        res.json({ ok: true, creations: [] });
        return;
      }
      const creations = await listUserCreations(req.user!.uid, 30);
      res.json({ ok: true, creations });
    } catch (err) {
      logger.error({ err }, 'studio_creations_list_failed');
      res.status(500).json({ ok: false, error: 'No se pudo cargar tu galería guardada.' });
    }
  });

  app.post('/api/studio/creations', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const body = (req.body || {}) as {
        kind?: 'image' | 'music' | 'video' | 'transcript';
        title?: string;
        prompt?: string;
        model?: string;
        mimeType?: string;
        mediaDataUrl?: string;
        metadataJson?: Record<string, unknown>;
      };
      const kind = body.kind;
      if (!kind || !['image', 'music', 'video', 'transcript'].includes(kind)) {
        res.status(400).json({ ok: false, error: 'Tipo de creación inválido.' });
        return;
      }
      if (!body.mediaDataUrl || !body.prompt) {
        res.status(400).json({ ok: false, error: 'Faltan datos para guardar la creación.' });
        return;
      }

      const row = await insertUserCreation({
        userId: req.user!.uid,
        kind,
        title: String(body.title || body.prompt).slice(0, 120),
        prompt: String(body.prompt),
        model: String(body.model || 'gemini'),
        mimeType: String(body.mimeType || 'text/plain'),
        mediaDataUrl: String(body.mediaDataUrl),
        metadataJson: body.metadataJson || null,
      });
      res.status(201).json({ ok: true, creation: row });
    } catch (err) {
      logger.error({ err }, 'studio_creations_insert_failed');
      res.status(500).json({ ok: false, error: 'No se pudo guardar en tu cuenta.' });
    }
  });

  app.delete('/api/studio/creations/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ ok: false, error: 'ID inválido.' });
        return;
      }
      const ok = await deleteUserCreation(req.user!.uid, id);
      res.json({ ok });
    } catch (err) {
      logger.error({ err }, 'studio_creations_delete_failed');
      res.status(500).json({ ok: false, error: 'No se pudo eliminar la creación.' });
    }
  });

  // CLOUD SQL PERSISTENCE: ARCADE GAME LEADERBOARD
  app.get('/api/studio/scores', async (req: Request, res: Response) => {
    try {
      const gameId = String(req.query.gameId || 'riffan-arcade').slice(0, 64);
      if (!isCloudSqlConfigured()) {
        res.json({ ok: true, scores: [] });
        return;
      }
      const scores = await listGameLeaderboard(gameId, 20);
      res.json({ ok: true, scores });
    } catch (err) {
      logger.error({ err }, 'studio_scores_list_failed');
      res.status(500).json({ ok: false, error: 'No se pudo cargar la clasificación.' });
    }
  });

  app.post('/api/studio/scores', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const body = (req.body || {}) as {
        gameId?: string;
        playerName?: string;
        score?: number;
        wave?: number;
      };
      const scoreVal = Number(body.score || 0);
      if (!Number.isFinite(scoreVal) || scoreVal < 0) {
        res.status(400).json({ ok: false, error: 'Puntuación inválida.' });
        return;
      }
      const row = await insertGameScore({
        userId: req.user?.uid || null,
        playerName: String(req.user?.name || body.playerName || 'Jugador').trim().slice(0, 80),
        gameId: String(body.gameId || 'riffan-arcade').slice(0, 64),
        score: scoreVal,
        wave: Number(body.wave || 1),
      });
      res.status(201).json({ ok: true, score: row });
    } catch (err) {
      logger.error({ err }, 'studio_scores_insert_failed');
      res.status(500).json({ ok: false, error: 'No se pudo registrar la puntuación.' });
    }
  });

  // CLOUD SQL PERSISTENCE: SAVED CINEMA & FILMING PLACES
  app.get('/api/studio/places', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!isCloudSqlConfigured()) {
        res.json({ ok: true, places: [] });
        return;
      }
      const places = await listUserSavedPlaces(req.user!.uid);
      res.json({ ok: true, places });
    } catch (err) {
      logger.error({ err }, 'studio_places_list_failed');
      res.status(500).json({ ok: false, error: 'No se pudieron cargar tus lugares.' });
    }
  });

  app.post('/api/studio/places', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const body = (req.body || {}) as {
        placeId?: string;
        name?: string;
        formattedAddress?: string;
        category?: string;
        notes?: string;
        googleMapsUri?: string;
      };
      if (!body.placeId || !body.name) {
        res.status(400).json({ ok: false, error: 'Falta identificador o nombre del lugar.' });
        return;
      }
      const place = await upsertUserSavedPlace({
        userId: req.user!.uid,
        placeId: String(body.placeId),
        name: String(body.name),
        formattedAddress: body.formattedAddress ? String(body.formattedAddress) : null,
        category: body.category ? String(body.category) : 'cinema',
        notes: body.notes ? String(body.notes) : null,
        googleMapsUri: body.googleMapsUri ? String(body.googleMapsUri) : null,
      });
      res.status(201).json({ ok: true, place });
    } catch (err) {
      logger.error({ err }, 'studio_places_save_failed');
      res.status(500).json({ ok: false, error: 'No se pudo guardar el lugar.' });
    }
  });

  app.delete('/api/studio/places/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ ok: false, error: 'ID inválido.' });
        return;
      }
      const ok = await deleteUserSavedPlace(req.user!.uid, id);
      res.json({ ok });
    } catch (err) {
      logger.error({ err }, 'studio_places_delete_failed');
      res.status(500).json({ ok: false, error: 'No se pudo eliminar el lugar.' });
    }
  });
}
