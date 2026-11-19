import type express from 'express';
import {
  isDistributedStoreEnabled,
  loadDistributedKey,
  saveDistributedKey,
} from '../services/distributedStore.ts';
import { canUserControlRoom } from '../services/roomSync.ts';
import type { TvPairingSession } from './roomHubHelpers.ts';
import type { RoomHubContext } from './handlers/types.ts';

export function registerRoomHttpRoutes(app: express.Express, ctx: RoomHubContext): void {
  const {
    rooms,
    tvPairingSessions,
    tvHttpHeartbeats,
    tvAuthTokens,
    generateTvPairingCode,
    getOrCreateRoom,
    hydrateRoomFromDistributedIfMissing,
    serializeRoomForClient,
    broadcastToRoom,
    claimTvPairingCodeCore,
  } = ctx;

  // SMART TV (SAMSUNG TIZEN / LG WEBOS / ANDROID TV) HTTP PAIRING & SYNC FALLBACK
  app.post('/api/tv/register', (req, res) => {
    const forceNew = Boolean(req.body?.forceNew);
    const existingCode = String(req.body?.existingCode || '')
      .replace(/\D/g, '')
      .slice(0, 4);
    const now = Date.now();

    if (!forceNew && existingCode.length === 4) {
      const existing = tvPairingSessions.get(existingCode);
      if (existing && existing.expiresAt > now && !existing.pairedPayload) {
        existing.expiresAt = now + 15 * 60 * 1000;
        tvPairingSessions.set(existingCode, existing, 15 * 60 * 1000);
        return res.json({
          success: true,
          code: existing.code,
          expiresAt: existing.expiresAt,
        });
      }
    }

    const code = generateTvPairingCode();
    const expiresAt = now + 15 * 60 * 1000;
    tvPairingSessions.set(code, {
      code,
      ws: null,
      createdAt: now,
      expiresAt,
    });
    saveDistributedKey(`tvpair:${code}`, { code, createdAt: now, expiresAt }, 900).catch(() => {});

    return res.json({
      success: true,
      code,
      expiresAt,
    });
  });

  app.get('/api/tv/poll/:code', async (req, res) => {
    const code = String(req.params.code || '')
      .replace(/\D/g, '')
      .slice(0, 4);
    let session = tvPairingSessions.get(code);
    if (!session && isDistributedStoreEnabled()) {
      const remote = await loadDistributedKey<TvPairingSession>(`tvpair:${code}`);
      if (remote) {
        session = remote;
        tvPairingSessions.set(code, remote);
      }
    }
    if (!session || session.expiresAt <= Date.now()) {
      return res.json({ success: false, expired: true, paired: false });
    }
    if (session.pairedPayload) {
      return res.json({
        success: true,
        paired: true,
        ...session.pairedPayload,
      });
    }
    return res.json({
      success: true,
      paired: false,
      expiresAt: session.expiresAt,
    });
  });

  app.post('/api/tv/claim', (req, res) => {
    const result = claimTvPairingCodeCore({
      rawCode: req.body?.code,
      targetRoomId: req.body?.roomId,
      roomNameHint: req.body?.roomName,
      claimedByRaw: req.body?.claimedBy,
    });

    if (!result.ok) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    return res.json({
      success: true,
      code: result.code,
      roomId: result.roomId,
      roomName: result.roomName,
    });
  });

  app.post('/api/tv/remote', (req, res) => {
    const roomId = String(req.body?.roomId || '')
      .trim()
      .toLowerCase();
    const command = String(req.body?.command || '').trim();
    const senderName = String(req.body?.senderName || 'Mando móvil')
      .trim()
      .slice(0, 32);
    const userId = String(req.body?.userId || '').trim();

    const room = rooms.get(roomId);
    if (!room || !command) {
      return res.status(404).json({ success: false, error: 'Sala no encontrada' });
    }
    if (
      !canUserControlRoom({
        hostOnlyControl: room.hostOnlyControl,
        creatorId: room.creatorId,
        hostId: room.hostId,
        userId: userId || undefined,
        participants: room.participants,
      })
    ) {
      return res.status(403).json({
        success: false,
        error: 'Solo el anfitrión o un Co-anfitrión controla la sala',
      });
    }

    room.lastTvRemoteCommand = {
      seq: (room.lastTvRemoteCommand?.seq || 0) + 1,
      command,
      senderName,
      ts: Date.now(),
    };

    broadcastToRoom(room.id, {
      type: 'TV_REMOTE_COMMAND',
      payload: {
        command,
        senderName,
        seq: room.lastTvRemoteCommand.seq,
      },
    });

    return res.json({ success: true, seq: room.lastTvRemoteCommand.seq });
  });

  app.get('/api/rooms/:roomId', async (req, res) => {
    const roomId = String(req.params.roomId || '').toLowerCase();
    await hydrateRoomFromDistributedIfMissing(roomId);
    const { room } = getOrCreateRoom(roomId);

    if (room.pinCode) {
      const incomingPin = typeof req.query.pin === 'string' ? req.query.pin.trim() : '';
      const incomingTvToken =
        typeof req.query.tvAuthToken === 'string' ? req.query.tvAuthToken.trim() : '';
      let validTvToken = false;
      if (incomingTvToken) {
        let tokenEntry = tvAuthTokens.get(incomingTvToken);
        if (!tokenEntry && isDistributedStoreEnabled()) {
          const remoteTok = await loadDistributedKey<{ roomId: string; expiresAt: number }>(
            `tvtoken:${incomingTvToken}`
          );
          if (remoteTok) {
            tvAuthTokens.set(incomingTvToken, remoteTok);
            tokenEntry = remoteTok;
          }
        }
        if (tokenEntry && tokenEntry.roomId === roomId && tokenEntry.expiresAt > Date.now()) {
          validTvToken = true;
        }
      }
      if (!validTvToken && incomingPin !== room.pinCode) {
        return res.status(403).json({
          error: 'PIN required',
          hasPin: true,
          roomName: room.name,
        });
      }
    }

    if (req.query.tv === '1') {
      const ua = String(req.headers['user-agent'] || '');
      const defaultTvName = /Web0S|WebOS|LG/i.test(ua)
        ? 'LG webOS Smart TV'
        : /Tizen|Samsung/i.test(ua)
          ? 'Samsung Smart TV'
          : 'Smart TV';
      const tvId =
        typeof req.query.tvId === 'string' && req.query.tvId.trim()
          ? req.query.tvId.trim().slice(0, 40)
          : `tv-http-${roomId}`;
      const tvNameRaw =
        typeof req.query.tvName === 'string' && req.query.tvName.trim()
          ? req.query.tvName.trim().slice(0, 28)
          : defaultTvName;
      const tvDisplayName = tvNameRaw.includes('(TV)') ? tvNameRaw : `${tvNameRaw} (TV)`;
      tvHttpHeartbeats.set(`${roomId}:${tvId}`, Date.now());

      const exists = room.participants.some((p) => p.id === tvId);
      if (!exists) {
        room.participants.push({
          id: tvId,
          name: tvDisplayName,
          avatar: '📺',
          color: '#E11D48',
          isHost: false,
          joinedAt: Date.now(),
        });
        broadcastToRoom(roomId, {
          type: 'PARTICIPANTS_UPDATED',
          payload: {
            participants: room.participants,
            hostId: room.hostId,
          },
        });
      }
    }

    const now = Date.now();
    let pruned = false;
    for (const [key, lastSeen] of tvHttpHeartbeats.entries()) {
      if (now - lastSeen > 12_000) {
        tvHttpHeartbeats.delete(key);
        const [rId, pId] = key.split(':');
        if (rId === roomId && pId) {
          const before = room.participants.length;
          room.participants = room.participants.filter((p) => p.id !== pId);
          if (room.participants.length !== before) pruned = true;
        }
      }
    }
    if (pruned) {
      broadcastToRoom(roomId, {
        type: 'PARTICIPANTS_UPDATED',
        payload: {
          participants: room.participants,
          hostId: room.hostId,
        },
      });
    }

    res.json(serializeRoomForClient(room));
  });
}
