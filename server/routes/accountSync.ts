import crypto from 'crypto';
import type { Express, Response } from 'express';
import {
  createSignedCloudToken,
  requireAuth,
  verifyFirebaseIdTokenToUser,
  verifySignedCloudToken,
  type AuthenticatedRequest,
  type AuthenticatedUser,
} from '../../src/middleware/auth.ts';
import {
  clearUserWatchHistorySql,
  deleteUserFavoriteSql,
  deleteUserFriendSql,
  deleteUserSavedRoomSql,
  deleteUserWatchHistorySql,
  getFullUserAccountState,
  getOrCreateUser,
  updateUserWatchProgressSql,
  upsertUserFavoriteSql,
  upsertUserFriendSql,
  upsertUserProfileSql,
  upsertUserSavedRoomSql,
  upsertUserWatchHistorySql,
} from '../../src/db/repository.ts';
import { isCloudSqlConfigured } from '../../src/db/index.ts';
import { logger } from '../utils/logger.ts';

interface BridgeSessionEntry {
  status: 'pending' | 'completed';
  createdAt: number;
  expiresAt: number;
  cloudToken?: string;
  user?: AuthenticatedUser;
}

interface LinkCodeEntry {
  user: AuthenticatedUser;
  createdAt: number;
  expiresAt: number;
}

const BRIDGE_TTL_MS = 10 * 60 * 1000;
const LINK_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const bridgeSessions = new Map<string, BridgeSessionEntry>();
const deviceLinkCodes = new Map<string, LinkCodeEntry>();

function pruneAuthPairingMaps(): void {
  const now = Date.now();
  for (const [k, v] of bridgeSessions) {
    if (v.expiresAt <= now) bridgeSessions.delete(k);
  }
  for (const [k, v] of deviceLinkCodes) {
    if (v.expiresAt <= now) deviceLinkCodes.delete(k);
  }
}

function generateSixCharLinkCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += LINK_CODE_ALPHABET[crypto.randomInt(0, LINK_CODE_ALPHABET.length)];
  }
  return code;
}

export function registerAccountSyncRoutes(app: Express): void {
  // ============================================================================
  // CHROME OAUTH BRIDGE & 6-CHAR DEVICE LINK CODE (APK / STANDALONE PWA)
  // ============================================================================
  app.post('/api/account/bridge/start', (_req, res: Response) => {
    pruneAuthPairingMaps();
    const sessionId = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = now + BRIDGE_TTL_MS;
    bridgeSessions.set(sessionId, {
      status: 'pending',
      createdAt: now,
      expiresAt,
    });
    res.json({ ok: true, sessionId, expiresAt });
  });

  app.post('/api/account/bridge/complete', async (req, res: Response) => {
    try {
      pruneAuthPairingMaps();
      const body = (req.body || {}) as {
        sessionId?: string;
        idToken?: string;
        cloudToken?: string;
      };
      const sessionId = String(body.sessionId || '').trim();
      const entry = bridgeSessions.get(sessionId);
      if (!sessionId || !entry || entry.expiresAt <= Date.now()) {
        res.status(404).json({
          ok: false,
          error: 'La sesión de enlace ha caducado. Genera una nueva desde la app.',
        });
        return;
      }

      let verifiedUser: AuthenticatedUser | null = null;
      if (typeof body.idToken === 'string' && body.idToken.trim()) {
        verifiedUser = await verifyFirebaseIdTokenToUser(body.idToken.trim());
      } else if (typeof body.cloudToken === 'string' && body.cloudToken.trim()) {
        verifiedUser = verifySignedCloudToken(body.cloudToken.trim());
      }

      if (!verifiedUser) {
        res.status(401).json({
          ok: false,
          error: 'No se pudo verificar la cuenta de Google. Vuelve a iniciar sesión en Chrome.',
        });
        return;
      }

      await getOrCreateUser({
        uid: verifiedUser.uid,
        email: verifiedUser.email,
        displayName: verifiedUser.name || null,
        photoUrl: verifiedUser.picture || null,
      }).catch(() => {});

      const cloudToken = createSignedCloudToken(verifiedUser);
      bridgeSessions.set(sessionId, {
        status: 'completed',
        createdAt: entry.createdAt,
        expiresAt: Math.max(entry.expiresAt, Date.now() + 2 * 60 * 1000),
        cloudToken,
        user: verifiedUser,
      });

      res.json({ ok: true, cloudToken, user: verifiedUser });
    } catch (err) {
      logger.error({ err }, 'account_bridge_complete_failed');
      res.status(500).json({ ok: false, error: 'Error al completar la vinculación con Chrome.' });
    }
  });

  app.get('/api/account/bridge/status/:sessionId', (req, res: Response) => {
    pruneAuthPairingMaps();
    const sessionId = String(req.params.sessionId || '').trim();
    const entry = bridgeSessions.get(sessionId);
    if (!entry || entry.expiresAt <= Date.now()) {
      res.json({ ok: true, status: 'expired' });
      return;
    }
    if (entry.status === 'completed' && entry.cloudToken && entry.user) {
      res.json({
        ok: true,
        status: 'completed',
        cloudToken: entry.cloudToken,
        user: entry.user,
      });
      return;
    }
    res.json({ ok: true, status: 'pending', expiresAt: entry.expiresAt });
  });

  app.post('/api/account/link-code', async (req, res: Response) => {
    try {
      pruneAuthPairingMaps();
      const authHeader = String(req.headers.authorization || '');
      const rawToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      let verifiedUser: AuthenticatedUser | null = null;
      if (rawToken.startsWith('riffan_cloud_')) {
        verifiedUser = verifySignedCloudToken(rawToken);
      } else if (rawToken && !rawToken.startsWith('riffan_profile_') && !rawToken.startsWith('cloud_')) {
        verifiedUser = await verifyFirebaseIdTokenToUser(rawToken);
      }

      if (!verifiedUser) {
        res.status(401).json({
          ok: false,
          error: 'Inicia sesión con Google primero para generar un código de vinculación.',
        });
        return;
      }

      let code = generateSixCharLinkCode();
      for (let i = 0; i < 6 && deviceLinkCodes.has(code); i++) {
        code = generateSixCharLinkCode();
      }
      const now = Date.now();
      const expiresAt = now + BRIDGE_TTL_MS;
      deviceLinkCodes.set(code, { user: verifiedUser, createdAt: now, expiresAt });
      res.json({ ok: true, code, expiresAt });
    } catch (err) {
      logger.error({ err }, 'account_link_code_failed');
      res.status(500).json({ ok: false, error: 'No se pudo generar el código de vinculación.' });
    }
  });

  app.post('/api/account/link-claim', async (req, res: Response) => {
    try {
      pruneAuthPairingMaps();
      const body = (req.body || {}) as { code?: string };
      const code = String(body.code || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
      if (code.length < 4) {
        res.status(400).json({ ok: false, error: 'Introduce el código de 6 caracteres.' });
        return;
      }
      const entry = deviceLinkCodes.get(code);
      if (!entry || entry.expiresAt <= Date.now()) {
        res.status(404).json({
          ok: false,
          error: 'Código inválido o caducado. Genera uno nuevo en tu otro dispositivo.',
        });
        return;
      }
      deviceLinkCodes.delete(code);

      await getOrCreateUser({
        uid: entry.user.uid,
        email: entry.user.email,
        displayName: entry.user.name || null,
        photoUrl: entry.user.picture || null,
      }).catch(() => {});

      const cloudToken = createSignedCloudToken(entry.user);
      res.json({ ok: true, cloudToken, user: entry.user });
    } catch (err) {
      logger.error({ err }, 'account_link_claim_failed');
      res.status(500).json({ ok: false, error: 'No se pudo validar el código de vinculación.' });
    }
  });
  // Hydrate full persistent user state from Cloud SQL PostgreSQL
  app.get('/api/account/state', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!isCloudSqlConfigured()) {
        res.json({
          ok: true,
          sqlEnabled: false,
          profile: null,
          favorites: [],
          watchHistory: [],
          friends: [],
          savedRooms: [],
        });
        return;
      }

      const state = await getFullUserAccountState(req.user!.uid);
      res.json({
        ok: true,
        sqlEnabled: true,
        ...state,
      });
    } catch (err) {
      logger.error({ err }, 'account_state_fetch_failed');
      res.status(500).json({ ok: false, error: 'No se pudo cargar tu perfil desde SQL.' });
    }
  });

  // Save/update user profile
  app.put('/api/account/profile', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const body = (req.body || {}) as {
        displayName?: string;
        avatar?: string;
        color?: string;
        friendCode?: string | null;
        photoUrl?: string | null;
      };
      const profile = await upsertUserProfileSql({
        userId: req.user!.uid,
        displayName: String(body.displayName || req.user?.name || 'Cineasta').trim(),
        avatar: String(body.avatar || '🍿').trim(),
        color: String(body.color || '#9146FF').trim(),
        friendCode: body.friendCode ? String(body.friendCode).trim() : null,
        photoUrl: body.photoUrl ? String(body.photoUrl).trim() : req.user?.picture || null,
      });
      res.json({ ok: true, profile });
    } catch (err) {
      logger.error({ err }, 'account_profile_upsert_failed');
      res.status(500).json({ ok: false, error: 'No se pudo guardar el perfil.' });
    }
  });

  // Upsert favorite (movie, series, or live channel)
  app.post('/api/account/favorites/upsert', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const body = (req.body || {}) as {
        favKey?: string;
        kind?: 'movie' | 'series' | 'channel';
        tmdbId?: number;
        title?: string;
        subtitle?: string;
        poster?: string;
        backdrop?: string;
        year?: string;
        rating?: string;
        mediaUrl?: string;
        channelLabel?: string;
        competition?: string;
        sport?: string;
      };
      if (!body.favKey || !body.title) {
        res.status(400).json({ ok: false, error: 'Falta identificador o título del favorito.' });
        return;
      }
      const kind =
        body.kind === 'series' || body.kind === 'channel' ? body.kind : 'movie';
      const favorite = await upsertUserFavoriteSql({
        userId: req.user!.uid,
        favKey: String(body.favKey),
        kind,
        tmdbId: typeof body.tmdbId === 'number' ? body.tmdbId : null,
        title: String(body.title),
        subtitle: body.subtitle ? String(body.subtitle) : null,
        poster: body.poster ? String(body.poster) : null,
        backdrop: body.backdrop ? String(body.backdrop) : null,
        year: body.year ? String(body.year) : null,
        rating: body.rating ? String(body.rating) : null,
        mediaUrl: body.mediaUrl ? String(body.mediaUrl) : null,
        channelLabel: body.channelLabel ? String(body.channelLabel) : null,
        competition: body.competition ? String(body.competition) : null,
        sport: body.sport ? String(body.sport) : null,
      });
      res.json({ ok: true, favorite });
    } catch (err) {
      logger.error({ err }, 'account_favorite_upsert_failed');
      res.status(500).json({ ok: false, error: 'No se pudo guardar en Mi Lista.' });
    }
  });

  // Delete favorite(s)
  app.delete('/api/account/favorites/:favKey', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ok = await deleteUserFavoriteSql(req.user!.uid, String(req.params.favKey || ''));
      res.json({ ok });
    } catch (err) {
      logger.error({ err }, 'account_favorite_delete_failed');
      res.status(500).json({ ok: false, error: 'No se pudo eliminar de Mi Lista.' });
    }
  });

  // Upsert watch history item
  app.post('/api/account/history/upsert', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const body = (req.body || {}) as {
        itemKey?: string;
        mediaType?: 'movie' | 'tv';
        tmdbId?: number;
        title?: string;
        subtitle?: string;
        poster?: string;
        backdrop?: string;
        year?: string;
        season?: number;
        episode?: number;
        episodeTitle?: string;
        preferLang?: string;
        bingetrixUrl?: string;
        movidyUrl?: string;
        resumeTimeSec?: number;
        durationSec?: number;
      };
      if (!body.itemKey || !body.title) {
        res.status(400).json({ ok: false, error: 'Falta identificador o título del historial.' });
        return;
      }
      const row = await upsertUserWatchHistorySql({
        userId: req.user!.uid,
        itemKey: String(body.itemKey),
        mediaType: body.mediaType === 'tv' ? 'tv' : 'movie',
        tmdbId: typeof body.tmdbId === 'number' ? body.tmdbId : null,
        title: String(body.title),
        subtitle: body.subtitle ? String(body.subtitle) : null,
        poster: body.poster ? String(body.poster) : null,
        backdrop: body.backdrop ? String(body.backdrop) : null,
        year: body.year ? String(body.year) : null,
        season: typeof body.season === 'number' ? body.season : null,
        episode: typeof body.episode === 'number' ? body.episode : null,
        episodeTitle: body.episodeTitle ? String(body.episodeTitle) : null,
        preferLang: body.preferLang ? String(body.preferLang) : 'ES',
        bingetrixUrl: body.bingetrixUrl ? String(body.bingetrixUrl) : null,
        movidyUrl: body.movidyUrl ? String(body.movidyUrl) : null,
        resumeTimeSec: Number(body.resumeTimeSec || 0),
        durationSec: Number(body.durationSec || 0),
      });
      res.json({ ok: true, item: row });
    } catch (err) {
      logger.error({ err }, 'account_history_upsert_failed');
      res.status(500).json({ ok: false, error: 'No se pudo guardar el historial.' });
    }
  });

  // Update playback progress timestamp
  app.patch('/api/account/history/progress', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const body = (req.body || {}) as {
        itemKey?: string;
        resumeTimeSec?: number;
        durationSec?: number;
      };
      if (!body.itemKey) {
        res.status(400).json({ ok: false, error: 'Falta itemKey.' });
        return;
      }
      const ok = await updateUserWatchProgressSql(
        req.user!.uid,
        String(body.itemKey),
        Number(body.resumeTimeSec || 0),
        Number(body.durationSec || 0)
      );
      res.json({ ok });
    } catch (err) {
      logger.error({ err }, 'account_history_progress_failed');
      res.status(500).json({ ok: false, error: 'No se pudo actualizar el progreso.' });
    }
  });

  // Delete single history item
  app.delete('/api/account/history/:itemKey', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ok = await deleteUserWatchHistorySql(req.user!.uid, String(req.params.itemKey || ''));
      res.json({ ok });
    } catch (err) {
      logger.error({ err }, 'account_history_delete_failed');
      res.status(500).json({ ok: false, error: 'No se pudo borrar del historial.' });
    }
  });

  // Clear all history for user
  app.delete('/api/account/history', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      await clearUserWatchHistorySql(req.user!.uid);
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, 'account_history_clear_failed');
      res.status(500).json({ ok: false, error: 'No se pudo limpiar el historial.' });
    }
  });

  // Upsert saved friend
  app.post('/api/account/friends/upsert', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const body = (req.body || {}) as {
        friendId?: string;
        name?: string;
        avatar?: string;
        color?: string;
        friendCode?: string;
      };
      if (!body.friendId || !body.name) {
        res.status(400).json({ ok: false, error: 'Falta identificador o nombre del amigo.' });
        return;
      }
      const friend = await upsertUserFriendSql({
        userId: req.user!.uid,
        friendId: String(body.friendId),
        name: String(body.name),
        avatar: String(body.avatar || '🍿'),
        color: String(body.color || '#9146FF'),
        friendCode: body.friendCode ? String(body.friendCode) : null,
      });
      res.json({ ok: true, friend });
    } catch (err) {
      logger.error({ err }, 'account_friend_upsert_failed');
      res.status(500).json({ ok: false, error: 'No se pudo guardar el amigo.' });
    }
  });

  // Delete friend
  app.delete('/api/account/friends/:friendId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ok = await deleteUserFriendSql(req.user!.uid, String(req.params.friendId || ''));
      res.json({ ok });
    } catch (err) {
      logger.error({ err }, 'account_friend_delete_failed');
      res.status(500).json({ ok: false, error: 'No se pudo eliminar el amigo.' });
    }
  });

  // Upsert permanent room
  app.post('/api/account/rooms/upsert', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const body = (req.body || {}) as {
        roomCode?: string;
        roomName?: string;
        hasPin?: boolean;
        pinCode?: string;
        hostOnlyControl?: boolean;
        lastActiveTitle?: string;
        queueItems?: Record<string, unknown>[];
      };
      if (!body.roomCode) {
        res.status(400).json({ ok: false, error: 'Falta código de sala.' });
        return;
      }
      const room = await upsertUserSavedRoomSql({
        userId: req.user!.uid,
        roomCode: String(body.roomCode),
        roomName: String(body.roomName || `Sala ${String(body.roomCode).toUpperCase()}`),
        hasPin: Boolean(body.hasPin && body.pinCode),
        pinCode: body.pinCode ? String(body.pinCode) : null,
        hostOnlyControl: Boolean(body.hostOnlyControl),
        lastActiveTitle: body.lastActiveTitle ? String(body.lastActiveTitle) : null,
        queueItems: Array.isArray(body.queueItems) ? body.queueItems : [],
      });
      res.json({ ok: true, room });
    } catch (err) {
      logger.error({ err }, 'account_room_upsert_failed');
      res.status(500).json({ ok: false, error: 'No se pudo guardar la sala permanente.' });
    }
  });

  // Delete permanent room
  app.delete('/api/account/rooms/:roomCode', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ok = await deleteUserSavedRoomSql(req.user!.uid, String(req.params.roomCode || ''));
      res.json({ ok });
    } catch (err) {
      logger.error({ err }, 'account_room_delete_failed');
      res.status(500).json({ ok: false, error: 'No se pudo eliminar la sala permanente.' });
    }
  });
}
