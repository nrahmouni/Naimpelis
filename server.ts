import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomBytes, randomUUID } from 'crypto';
import { Readable } from 'stream';
import path from 'path';
import { fileURLToPath } from 'url';
import { RemoteBrowserManager, isAllowedRemoteBrowserUrl } from './server/RemoteBrowserManager';
import { RemoteBrowserInput } from './src/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '16kb' }));
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws', maxPayload: 16 * 1024 });
wss.on('error', (error) => {
  if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') {
    console.error('WebSocket server error:', error);
  }
});
const roomHostTokens = new Map<string, string>();

// In-memory room store
interface RoomStore {
  [roomId: string]: {
    id: string;
    name: string;
    hostId: string;
    videoState: {
      url: string;
      title: string;
      sourceType: 'youtube' | 'vimeo' | 'direct' | 'iframe';
      currentTime: number;
      isPlaying: boolean;
      lastUpdated: number;
      updatedBy?: string;
    };
    participants: {
      id: string;
      name: string;
      avatar: string;
      color: string;
      isHost: boolean;
      joinedAt: number;
    }[];
    screenShareActive: boolean;
    remoteBrowserActive: boolean;
    remoteBrowserUrl?: string;
    messages: any[];
    createdAt: number;
  };
}

const rooms: RoomStore = Object.assign(Object.create(null), {
  'cinema-pro': {
    id: 'cinema-pro',
    name: 'Sala de Cine Principal 🍿',
    hostId: 'system',
    videoState: {
      url: 'https://movidy.pw/ver/hope/',
      title: 'Movidy',
      sourceType: 'iframe',
      currentTime: 0,
      isPlaying: false,
      lastUpdated: Date.now(),
    },
    participants: [],
    screenShareActive: false,
    remoteBrowserActive: false,
    messages: [
      {
        id: 'msg-welcome',
        senderId: 'system',
        senderName: 'Watch2Gether Bot',
        senderAvatar: '🍿',
        senderColor: '#f43f5e',
        text: '¡Bienvenidos a la sala! Pega cualquier enlace de película o vídeo para empezar a ver en sincronía.',
        timestamp: Date.now(),
        isSystem: true,
      },
    ],
    createdAt: Date.now(),
  },
});

// WebSocket connection map: client ws -> metadata
interface ClientMeta {
  ws: WebSocket;
  roomId?: string;
  userId?: string;
  userName?: string;
  userAvatar?: string;
  userColor?: string;
}

const clients = new Map<WebSocket, ClientMeta>();
const roomClients = new Map<string, Set<WebSocket>>();

function broadcastToRoom(roomId: string, message: any, excludeWs?: WebSocket) {
  const payload = JSON.stringify(message);
  roomClients.get(roomId)?.forEach((ws) => {
    if (ws.readyState !== WebSocket.OPEN || ws === excludeWs) return;
    if (ws.bufferedAmount > 1024 * 1024) {
      ws.close(1013, 'Slow consumer');
      return;
    }
    ws.send(payload);
  });
}

function sendToParticipant(roomId: string, userId: string, message: any) {
  const payload = JSON.stringify(message);
  roomClients.get(roomId)?.forEach((ws) => {
    const meta = clients.get(ws);
    if (meta?.userId === userId && ws.readyState === WebSocket.OPEN) ws.send(payload);
  });
}

const remoteBrowserManager = new RemoteBrowserManager((roomId, message) => {
  broadcastToRoom(roomId, message);
  const event = message as { type?: string; payload?: { url?: string } };
  const room = rooms[roomId];
  if (event.type !== 'REMOTE_BROWSER_LOCATION' || !room || !isAllowedRemoteBrowserUrl(event.payload?.url || '')) return;

  const url = event.payload!.url!;
  room.remoteBrowserUrl = url;
  room.videoState.url = url;
  room.videoState.title = new URL(url).hostname;
  room.videoState.sourceType = 'iframe';
  room.videoState.lastUpdated = Date.now();
  broadcastToRoom(roomId, {
    type: 'VIDEO_STATE_UPDATED',
    payload: { videoState: room.videoState, action: 'navigate' },
  });
});

function getOrCreateRoom(roomId: string, roomName?: string) {
  if (!rooms[roomId]) {
    rooms[roomId] = {
      id: roomId,
      name: roomName || `Sala ${roomId.substring(0, 6)}`,
      hostId: '',
      videoState: {
        url: 'https://movidy.pw/ver/hope/',
        title: 'Movidy',
        sourceType: 'iframe',
        currentTime: 0,
        isPlaying: false,
        lastUpdated: Date.now(),
      },
      participants: [],
      screenShareActive: false,
      remoteBrowserActive: false,
      messages: [
        {
          id: `sys-${Date.now()}`,
          senderId: 'system',
          senderName: 'Sistema',
          senderAvatar: '🎬',
          senderColor: '#f43f5e',
          text: 'Sala creada. ¡Copia el enlace de invitación para invitar a tus amigos!',
          timestamp: Date.now(),
          isSystem: true,
        },
      ],
      createdAt: Date.now(),
    };
  }
  return rooms[roomId];
}

const proxyAllowedDomains = (process.env.PROXY_ALLOWED_HOSTS || 'movidy.pw,bingetrix.sc,vidsrc.me,vidsrc.to,vidsrc.pm,autoembed.to')
  .split(',')
  .map((domain) => domain.trim().toLowerCase())
  .filter(Boolean);
const tmdbCache = new Map<string, { expiresAt: number; value: unknown }>();

function readTmdbCache<T>(key: string): T | undefined {
  const entry = tmdbCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    tmdbCache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

function writeTmdbCache(key: string, value: unknown, ttlMs: number) {
  if (tmdbCache.size >= 200) tmdbCache.delete(tmdbCache.keys().next().value!);
  tmdbCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function parseAllowedProxyUrl(value: string) {
  const parsed = new URL(value);
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  const isAllowedHost = proxyAllowedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || !isAllowedHost) {
    throw new Error('Proxy destination is not allowed');
  }
  return parsed;
}

async function readTextWithLimit(response: Response, maxBytes: number) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new Error('Proxy response is too large');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
}

wss.on('connection', (ws, request) => {
  const origin = request.headers.origin;
  const requestHost = request.headers.host?.toLowerCase();
  try {
    if (!origin || !requestHost || new URL(origin).host.toLowerCase() !== requestHost) {
      ws.close(1008, 'Invalid origin');
      return;
    }
  } catch {
    ws.close(1008, 'Invalid origin');
    return;
  }

  clients.set(ws, { ws });

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      if (!data || typeof data !== 'object' || typeof data.type !== 'string' || !data.payload || typeof data.payload !== 'object') return;
      const { type, payload } = data;

      if (type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG', payload: { sentAt: payload.sentAt } }));
        return;
      }

      if (type === 'JOIN_ROOM') {
        if (clients.get(ws)?.roomId) return;
        const { roomId, userName, userAvatar, userColor, hostToken } = payload;
        if (typeof roomId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(roomId)) return;
        if (typeof userName !== 'string' || userName.length > 40) return;
        if (typeof userAvatar !== 'string' || userAvatar.length > 16) return;
        if (typeof userColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(userColor)) return;
        const room = rooms[roomId];
        if (!room) {
          ws.send(JSON.stringify({ type: 'ROOM_ERROR', payload: { message: 'Sala no encontrada' } }));
          return;
        }

        const userId = randomUUID();
        const isRoomOwner = typeof hostToken === 'string' && roomHostTokens.get(roomId) === hostToken;
        const canClaimPublicDemo = room.id === 'cinema-pro' && room.participants.length === 0;
        if ((isRoomOwner || canClaimPublicDemo) && (!room.hostId || room.hostId === 'system')) room.hostId = userId;

        const isHost = room.hostId === userId;
        const newParticipant = {
          id: userId,
          name: userName.trim() || 'Invitado',
          avatar: userAvatar,
          color: userColor,
          isHost,
          joinedAt: Date.now(),
        };
        room.participants.push(newParticipant);

        clients.set(ws, {
          ws,
          roomId,
          userId,
          userName,
          userAvatar,
          userColor,
        });
        const roomConnections = roomClients.get(roomId) || new Set<WebSocket>();
        roomConnections.add(ws);
        roomClients.set(roomId, roomConnections);

        // Add system message
        const joinMsg = {
          id: `join-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          senderId: 'system',
          senderName: 'Sistema',
          senderAvatar: '👋',
          senderColor: '#10b981',
          text: `${userName} se ha unido a la sala`,
          timestamp: Date.now(),
          isSystem: true,
          systemType: 'join',
        };
        room.messages.push(joinMsg);
        if (room.messages.length > 150) room.messages.shift();

        // Send full state to joining user
        ws.send(
          JSON.stringify({
            type: 'ROOM_STATE',
            payload: { ...room, currentUserId: userId },
          })
        );
        remoteBrowserManager.sendLatestFrame(roomId, ws);

        // Broadcast user joined update to others in room
        broadcastToRoom(
          roomId,
          {
            type: 'PARTICIPANTS_UPDATED',
            payload: {
              participants: room.participants,
              hostId: room.hostId,
              message: joinMsg,
            },
          },
          ws
        );
        return;
      }

      const meta = clients.get(ws);
      if (!meta?.roomId || !meta.userId || payload.roomId !== meta.roomId) return;
      const room = rooms[meta.roomId];
      if (!room || !room.participants.some((participant) => participant.id === meta.userId)) return;

      if (type === 'START_REMOTE_BROWSER') {
        if (room.hostId !== meta.userId) return;
        const { url } = payload;
        if (typeof url !== 'string' || url.length > 2048 || !isAllowedRemoteBrowserUrl(url)) {
          ws.send(JSON.stringify({ type: 'REMOTE_BROWSER_ERROR', payload: { message: 'El dominio no está permitido para el navegador remoto.' } }));
          return;
        }
        room.remoteBrowserActive = false;
        remoteBrowserManager.start(meta.roomId, meta.userId, url)
          .then(() => {
            room.remoteBrowserActive = true;
            room.remoteBrowserUrl = url;
            room.videoState.url = url;
            room.videoState.sourceType = 'iframe';
            room.videoState.currentTime = 0;
            room.videoState.isPlaying = true;
            room.videoState.lastUpdated = Date.now();
            broadcastToRoom(meta.roomId!, {
              type: 'REMOTE_BROWSER_READY',
              payload: { url, width: 1280, height: 720 },
            });
            broadcastToRoom(meta.roomId!, {
              type: 'VIDEO_STATE_UPDATED',
              payload: { videoState: room.videoState, action: 'change_url' },
            });
          })
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : 'No se pudo iniciar Chromium.';
            sendToParticipant(meta.roomId!, meta.userId!, {
              type: 'REMOTE_BROWSER_ERROR',
              payload: { message },
            });
          });
      } else if (type === 'REMOTE_BROWSER_INPUT') {
        if (room.hostId !== meta.userId) return;
        void remoteBrowserManager.input(meta.roomId, meta.userId, payload.input as RemoteBrowserInput)
          .catch(() => sendToParticipant(meta.roomId!, meta.userId!, {
            type: 'REMOTE_BROWSER_ERROR',
            payload: { message: 'No se pudo aplicar la interacción al navegador remoto.' },
          }));
      } else if (type === 'STOP_REMOTE_BROWSER') {
        if (room.hostId !== meta.userId) return;
        void remoteBrowserManager.stop(meta.roomId).then(() => {
          room.remoteBrowserActive = false;
          room.remoteBrowserUrl = undefined;
          broadcastToRoom(meta.roomId!, { type: 'REMOTE_BROWSER_STOPPED', payload: {} });
        });
      } else if (type === 'UPDATE_PROFILE') {
        const { userName, userAvatar, userColor } = payload;
        if (typeof userName !== 'string' || !userName.trim() || userName.length > 40) return;
        if (typeof userAvatar !== 'string' || userAvatar.length > 16) return;
        if (typeof userColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(userColor)) return;
        meta.userName = userName.trim();
        meta.userAvatar = userAvatar;
        meta.userColor = userColor;
        const participant = room.participants.find((item) => item.id === meta.userId);
        if (participant) {
          participant.name = meta.userName;
          participant.avatar = meta.userAvatar;
          participant.color = meta.userColor;
        }
        broadcastToRoom(meta.roomId, {
          type: 'PARTICIPANTS_UPDATED',
          payload: { participants: room.participants, hostId: room.hostId },
        });
      } else if (type === 'SYNC_VIDEO_STATE') {
        if (room.hostId !== meta.userId) return;
        const { roomId, action, videoUrl, videoTitle, sourceType, currentTime, isPlaying, updatedBy, poster, overview, releaseYear, originalPortalUrl, altEmbeds, trailerUrl } = payload;
        if (!['play', 'pause', 'seek', 'change_url'].includes(action)) return;
        if (videoUrl !== undefined && (typeof videoUrl !== 'string' || videoUrl.length > 2048)) return;
        if (videoTitle !== undefined && (typeof videoTitle !== 'string' || videoTitle.length > 300)) return;
        if (sourceType !== undefined && !['youtube', 'vimeo', 'direct', 'iframe'].includes(sourceType)) return;
        if (currentTime !== undefined && (typeof currentTime !== 'number' || !Number.isFinite(currentTime) || currentTime < 0 || currentTime > 86400)) return;
        if (isPlaying !== undefined && typeof isPlaying !== 'boolean') return;
        if (altEmbeds !== undefined && (!Array.isArray(altEmbeds) || altEmbeds.length > 10 || altEmbeds.some((url: unknown) => typeof url !== 'string' || url.length > 2048))) return;

        if (videoUrl !== undefined) room.videoState.url = videoUrl;
        if (videoTitle !== undefined) room.videoState.title = videoTitle;
        if (sourceType !== undefined) room.videoState.sourceType = sourceType;
        if (currentTime !== undefined) room.videoState.currentTime = currentTime;
        if (isPlaying !== undefined) room.videoState.isPlaying = isPlaying;
        if (poster !== undefined) (room.videoState as any).poster = poster;
        if (overview !== undefined) (room.videoState as any).overview = overview;
        if (releaseYear !== undefined) (room.videoState as any).releaseYear = releaseYear;
        if (originalPortalUrl !== undefined) (room.videoState as any).originalPortalUrl = originalPortalUrl;
        if (altEmbeds !== undefined) (room.videoState as any).altEmbeds = altEmbeds;
        if (trailerUrl !== undefined) (room.videoState as any).trailerUrl = trailerUrl;
        
        room.videoState.lastUpdated = Date.now();
        room.videoState.updatedBy = meta.userName;

        let systemMsgText = '';
        if (action === 'change_url') {
          systemMsgText = `🎬 ${meta.userName || 'Un usuario'} cambió el vídeo a "${videoTitle || 'nuevo vídeo'}"`;
        } else if (action === 'play') {
          systemMsgText = `▶️ ${meta.userName || 'Un usuario'} reprodujo el vídeo`;
        } else if (action === 'pause') {
          systemMsgText = `⏸️ ${meta.userName || 'Un usuario'} pausó el vídeo`;
        } else if (action === 'seek') {
          systemMsgText = `⏩ ${meta.userName || 'Un usuario'} saltó a otra parte del vídeo`;
        }

        let roomMessage;
        if (systemMsgText) {
          const sysMsg = {
            id: `sys-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
            senderId: 'system',
            senderName: 'Sistema',
            senderAvatar: '🎬',
            senderColor: '#f43f5e',
            text: systemMsgText,
            timestamp: Date.now(),
            isSystem: true,
            systemType: action,
          };
          roomMessage = sysMsg;
          room.messages.push(sysMsg);
          if (room.messages.length > 150) room.messages.shift();
        }

        broadcastToRoom(meta.roomId, {
          type: 'VIDEO_STATE_UPDATED',
          payload: {
            videoState: room.videoState,
            action,
            message: roomMessage,
          },
        });
      } else if (type === 'SEND_CHAT') {
        const { text } = payload;
        if (typeof text !== 'string' || !text.trim() || text.length > 1000) return;

        const newMsg = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          senderId: meta.userId,
          senderName: meta.userName,
          senderAvatar: meta.userAvatar,
          senderColor: meta.userColor,
          text: text.trim(),
          timestamp: Date.now(),
        };

        room.messages.push(newMsg);
        if (room.messages.length > 150) room.messages.shift();

        broadcastToRoom(meta.roomId, {
          type: 'NEW_CHAT_MESSAGE',
          payload: newMsg,
        });
      } else if (type === 'SEND_REACTION') {
        const { emoji } = payload;
        if (typeof emoji !== 'string' || emoji.length > 16) return;

        const reaction = {
          id: `react-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          emoji,
          senderName: meta.userName,
          senderColor: meta.userColor,
          timestamp: Date.now(),
        };

        broadcastToRoom(meta.roomId, {
          type: 'FLOATING_REACTION',
          payload: reaction,
        });
      } else if (type === 'WEBRTC_SIGNAL') {
        const { signalData, targetId } = payload;
        if (!signalData || typeof signalData !== 'object' || Array.isArray(signalData) || typeof signalData.type !== 'string' || typeof targetId !== 'string') return;
        if (!['screen_share_started', 'screen_share_stopped', 'request_offer', 'offer', 'answer', 'candidate'].includes(signalData.type)) return;
        if (targetId !== 'all' && !room.participants.some((participant) => participant.id === targetId)) return;
        if ((signalData.type === 'screen_share_started' || signalData.type === 'screen_share_stopped') && (meta.userId !== room.hostId || targetId !== 'all')) return;
        if (signalData.type === 'request_offer' && (targetId !== room.hostId || meta.userId === room.hostId)) return;
        if (signalData.type === 'offer' && (meta.userId !== room.hostId || targetId === room.hostId)) return;
        if (signalData.type === 'answer' && (meta.userId === room.hostId || targetId !== room.hostId)) return;
        if (signalData.type === 'screen_share_started') room.screenShareActive = true;
        if (signalData.type === 'screen_share_stopped') room.screenShareActive = false;
        const signalMessage = {
          type: 'WEBRTC_SIGNAL',
          payload: {
            signalData,
            targetId,
            senderId: meta.userId,
          },
        };
        if (targetId === 'all') broadcastToRoom(meta.roomId, signalMessage, ws);
        else sendToParticipant(meta.roomId, targetId, signalMessage);
      } else if (type === 'TRANSFER_HOST') {
        if (room.hostId !== meta.userId) return;
        const { newHostId } = payload;
        if (typeof newHostId !== 'string' || !room.participants.some((participant) => participant.id === newHostId)) return;

        if (room.screenShareActive) {
          room.screenShareActive = false;
          broadcastToRoom(meta.roomId, {
            type: 'WEBRTC_SIGNAL',
            payload: { signalData: { type: 'screen_share_stopped' }, targetId: 'all', senderId: meta.userId },
          });
        }
        if (room.remoteBrowserActive) remoteBrowserManager.transferHost(meta.roomId, newHostId);
        room.hostId = newHostId;
        room.participants.forEach(p => {
          p.isHost = p.id === newHostId;
        });

        const newHost = room.participants.find(p => p.id === newHostId);
        const sysMsg = {
          id: `host-${Date.now()}`,
          senderId: 'system',
          senderName: 'Sistema',
          senderAvatar: '👑',
          senderColor: '#eab308',
          text: `${newHost ? newHost.name : 'Un usuario'} es ahora el anfitrión de la sala`,
          timestamp: Date.now(),
          isSystem: true,
          systemType: 'host_change',
        };
        room.messages.push(sysMsg);
        if (room.messages.length > 150) room.messages.shift();

        broadcastToRoom(meta.roomId, {
          type: 'HOST_TRANSFERRED',
          payload: {
            hostId: newHostId,
            participants: room.participants,
            message: sysMsg,
          },
        });
      }
    } catch (err) {
      console.error('WebSocket Error processing message:', err);
    }
  });

  ws.on('close', () => {
    const meta = clients.get(ws);
    clients.delete(ws);
    if (meta?.roomId) {
      const roomConnections = roomClients.get(meta.roomId);
      roomConnections?.delete(ws);
      if (roomConnections?.size === 0) roomClients.delete(meta.roomId);
    }

    if (meta && meta.roomId && meta.userId) {
      const room = rooms[meta.roomId];
      if (room) {
        room.participants = room.participants.filter((p) => p.id !== meta.userId);
        if (room.hostId === meta.userId && room.screenShareActive) {
          room.screenShareActive = false;
          broadcastToRoom(meta.roomId, {
            type: 'WEBRTC_SIGNAL',
            payload: { signalData: { type: 'screen_share_stopped' }, targetId: 'all', senderId: 'system' },
          }, ws);
        }
        if (room.hostId === meta.userId && room.remoteBrowserActive) {
          void remoteBrowserManager.stop(meta.roomId).then(() => {
            room.remoteBrowserActive = false;
            room.remoteBrowserUrl = undefined;
            broadcastToRoom(meta.roomId!, { type: 'REMOTE_BROWSER_STOPPED', payload: {} });
          });
        }
        
        // Host migration if host left
        if (room.hostId === meta.userId) {
          room.hostId = room.participants[0]?.id || '';
          room.participants.forEach((participant) => {
            participant.isHost = participant.id === room.hostId;
          });
        }

        const leaveMsg = {
          id: `leave-${Date.now()}`,
          senderId: 'system',
          senderName: 'Sistema',
          senderAvatar: '🏃',
          senderColor: '#94a3b8',
          text: `${meta.userName || 'Un usuario'} salió de la sala`,
          timestamp: Date.now(),
          isSystem: true,
          systemType: 'leave',
        };
        room.messages.push(leaveMsg);
        if (room.messages.length > 150) room.messages.shift();

        broadcastToRoom(meta.roomId, {
          type: 'PARTICIPANTS_UPDATED',
          payload: {
            participants: room.participants,
            hostId: room.hostId,
            message: leaveMsg,
          },
        });
      }
    }
  });
});

// REST Endpoints
app.get('/api/rooms/:roomId', (req, res) => {
  const room = rooms[req.params.roomId];
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json(room);
});

app.post('/api/rooms', (req, res) => {
  const { name } = req.body;
  if (name !== undefined && (typeof name !== 'string' || name.length > 80)) {
    return res.status(400).json({ error: 'Invalid room name' });
  }
  const roomId = `room-${randomUUID()}`;
  const hostToken = randomBytes(32).toString('base64url');
  const room = getOrCreateRoom(roomId, name);
  roomHostTokens.set(roomId, hostToken);
  res.json({ id: room.id, name: room.name, hostToken });
});

// Resolve public movie metadata and official trailers from TMDB.
app.get('/api/resolve-movie', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const queryUrl = (req.query.url as string) || '';
  if (!queryUrl || queryUrl.length > 2048) {
    return res.status(400).json({ success: false, error: 'Missing url parameter' });
  }

  try {
    const tmdbMatch = queryUrl.match(/(?:themoviedb\.org\/(?:movie|tv)\/|tmdb\/(?:tv\/)?)(\d+)/i);
    if (!tmdbMatch) return res.status(400).json({ success: false, error: 'Invalid TMDB title reference' });
    const tmdbId = tmdbMatch[1];
    const isTv = /(?:themoviedb\.org\/tv\/|tmdb\/tv\/)/i.test(queryUrl);
    const tmdbApiKey = process.env.TMDB_API_KEY;
    if (!tmdbApiKey) return res.status(503).json({ success: false, error: 'Movie metadata is unavailable' });
    const cacheKey = `resolve:${isTv ? 'tv' : 'movie'}:${tmdbId}`;
    const cached = readTmdbCache<Record<string, unknown>>(cacheKey);
    if (cached) return res.json({ ...cached, originalUrl: queryUrl });

    const mediaPath = isTv ? 'tv' : 'movie';
    const [movieRes, videosRes] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/${mediaPath}/${tmdbId}?api_key=${tmdbApiKey}&language=es-ES`, { signal: AbortSignal.timeout(8000) })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(`https://api.themoviedb.org/3/${mediaPath}/${tmdbId}/videos?api_key=${tmdbApiKey}`, { signal: AbortSignal.timeout(8000) })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]);

    if (!movieRes) return res.status(404).json({ success: false, error: 'Title not found' });
    const title = movieRes.title || movieRes.name || movieRes.original_title || movieRes.original_name;
    const overview = movieRes.overview || '';
    const poster = movieRes?.poster_path ? `https://image.tmdb.org/t/p/w500${movieRes.poster_path}` : '';
    const releaseYear = (movieRes.release_date || movieRes.first_air_date || '').split('-')[0];

    const videos = (videosRes as any)?.results || [];
    const trailer = videos.find((v: any) => v.site === 'YouTube' && v.type === 'Trailer') ||
                    videos.find((v: any) => v.site === 'YouTube');
    const trailerKey = trailer?.key || '';
    const trailerUrl = trailerKey ? `https://www.youtube.com/watch?v=${trailerKey}` : '';

    const result = {
      success: true,
      type: isTv ? 'tv' : 'movie',
      tmdbId,
      title,
      overview,
      poster,
      releaseYear,
      trailerUrl,
    };
    writeTmdbCache(cacheKey, result, 60 * 60 * 1000);
    return res.json({ ...result, originalUrl: queryUrl });
  } catch (err: any) {
    console.error('Error resolving movie URL:', err);
    return res.status(500).json({ success: false, error: 'Failed to resolve movie URL' });
  }
});

// Movie Catalog Search Endpoint for Virtual Browser Movie Finder
app.get('/api/search-movies', async (req, res) => {
  const query = (req.query.query as string) || '';
  if (query.length > 120) return res.status(400).json({ error: 'Search query is too long' });
  const tmdbApiKey = process.env.TMDB_API_KEY;
  if (!tmdbApiKey) return res.status(503).json({ error: 'Movie catalog is unavailable' });

  try {
    const normalizedQuery = query.trim().toLowerCase();
    const cacheKey = `search:${normalizedQuery || 'trending'}`;
    const cached = readTmdbCache<{ results: unknown[] }>(cacheKey);
    if (cached) return res.json(cached);
    const searchUrl = query.trim()
      ? `https://api.themoviedb.org/3/search/multi?api_key=${tmdbApiKey}&language=es-ES&query=${encodeURIComponent(query)}&page=1`
      : `https://api.themoviedb.org/3/trending/movie/week?api_key=${tmdbApiKey}&language=es-ES`;

    const r = await fetch(searchUrl, { signal: AbortSignal.timeout(8000) });
    const data = await r.json();

    const items = (data.results || [])
      .filter((m: any) => m.media_type !== 'person')
      .slice(0, 18)
      .map((m: any) => {
        const isTv = m.media_type === 'tv' || !!m.first_air_date;
        const id = m.id;
        const title = m.title || m.name || m.original_title || m.original_name;
        const year = (m.release_date || m.first_air_date || '').split('-')[0];
        const poster = m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : '';
        const backdrop = m.backdrop_path ? `https://image.tmdb.org/t/p/w780${m.backdrop_path}` : '';
        const rating = m.vote_average ? m.vote_average.toFixed(1) : '';
        const bingetrixUrl = isTv
          ? `https://bingetrix.sc/tv/${id}`
          : `https://bingetrix.sc/movie/${id}`;
        const movidyUrl = isTv
          ? `https://movidy.pw/embed/tv/${id}/1/1`
          : `https://movidy.pw/embed/movie/${id}`;

        return {
          id,
          title,
          year,
          overview: m.overview || 'Sinopsis no disponible en español.',
          poster,
          backdrop,
          rating,
          isTv,
          bingetrixUrl,
          movidyUrl,
        };
      });

    const result = { results: items };
    writeTmdbCache(cacheKey, result, normalizedQuery ? 30 * 60 * 1000 : 5 * 60 * 1000);
    res.json(result);
  } catch (err: any) {
    console.error('Search movies error:', err);
    res.status(500).json({ error: 'Error al buscar películas' });
  }
});

// Virtual Chrome Browser Proxy: strips framing restrictions, blocks intrusive redirects and injects sync bridge
app.get('/api/proxy-web', async (req, res) => {
  const targetUrl = (req.query.url as string) || '';
  const roomId = (req.query.roomId as string) || '';
  if (!targetUrl || targetUrl.length > 2048 || !/^[a-zA-Z0-9_-]{1,100}$/.test(roomId)) {
    return res.status(400).json({ error: 'Invalid proxy request' });
  }

  try {
    let parsed = parseAllowedProxyUrl(/^https?:\/\//i.test(targetUrl) ? targetUrl : `https://${targetUrl}`);
    let response: Response | undefined;
    for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        response = await fetch(parsed, {
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
            ...(typeof req.headers.range === 'string' ? { Range: req.headers.range } : {}),
          },
        });
      } finally {
        clearTimeout(timeout);
      }
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location || redirectCount === 5) throw new Error('Too many proxy redirects');
      parsed = parseAllowedProxyUrl(new URL(location, parsed).toString());
    }
    if (!response) throw new Error('Proxy upstream unavailable');
    const finalUrl = parsed.toString();

    const contentType = response.headers.get('content-type') || 'text/html';
    res.status(response.status).setHeader('Content-Type', contentType);

    if (contentType.includes('text/html')) {
      if (Number(response.headers.get('content-length')) > 5 * 1024 * 1024) {
        return res.status(413).send('La página externa supera el tamaño permitido.');
      }
      let html = await readTextWithLimit(response, 5 * 1024 * 1024);
      const baseHref = parsed.origin.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      const jsString = (value: string) => JSON.stringify(value).replace(/</g, '\\u003c');
      const encodedRoomId = encodeURIComponent(roomId);

      // Interceptor script injected into virtual browser:
      // 1. Intercepts link clicks and form submits, converting them to proxy URLs
      // 2. Notifies parent Watch2Gether app of URL changes so other users navigate simultaneously
      // 3. Intercepts HTML5 video play, pause, seek and timeupdate events to synchronize playback across room
      // 4. Blocks popunder and intrusive new window redirects (window.open = noop)
      const syncScript = `
        <base href="${baseHref}/">
        <script>
          (function() {
            // Block popups and intrusive ads
            window.open = function() { console.log('Blocked popup in virtual browser'); return null; };
            window.alert = function(m) { console.log('Alert suppressed:', m); };

            // Listen to link clicks and route through parent or proxy
            document.addEventListener('click', function(e) {
              const link = e.target.closest('a');
              if (link && link.href) {
                const href = link.getAttribute('href');
                if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
                  e.preventDefault();
                  let resolved = new URL(href, ${jsString(finalUrl)}).href;
                  if (window.parent && window.parent !== window) {
                    window.parent.postMessage({ type: 'VIRTUAL_BROWSER_NAVIGATE', url: resolved }, '*');
                  }
                  window.location.href = '/api/proxy-web?url=' + encodeURIComponent(resolved) + '&roomId=${encodedRoomId}';
                }
              }
            }, true);

            // Auto-detect and attach synchronization listeners to all <video> elements inside proxy
            function attachVideoSyncListeners() {
              const videos = document.querySelectorAll('video');
              videos.forEach(function(vid) {
                if (vid.dataset.w2gListening) return;
                vid.dataset.w2gListening = 'true';

                function sendSyncEvent(action) {
                  if (window.parent && window.parent !== window) {
                    window.parent.postMessage({
                      type: 'VIRTUAL_BROWSER_VIDEO_SYNC',
                      currentTime: vid.currentTime || 0,
                      isPlaying: !vid.paused,
                      duration: vid.duration || 0,
                      action: action || 'sync'
                    }, '*');
                  }
                }

                vid.addEventListener('play', function() { sendSyncEvent('play'); });
                vid.addEventListener('pause', function() { sendSyncEvent('pause'); });
                vid.addEventListener('seeked', function() { sendSyncEvent('seek'); });

                let lastUpdate = 0;
                vid.addEventListener('timeupdate', function() {
                  const now = Date.now();
                  if (now - lastUpdate > 1500 && !vid.paused) {
                    lastUpdate = now;
                    sendSyncEvent('timeupdate');
                  }
                });
              });
            }

            setInterval(attachVideoSyncListeners, 1000);
            window.addEventListener('DOMContentLoaded', attachVideoSyncListeners);
            window.addEventListener('load', attachVideoSyncListeners);

            // Receive remote sync commands from parent Watch2Gether room
            window.addEventListener('message', function(e) {
              if (e.data && e.data.type === 'W2G_REMOTE_VIDEO_COMMAND') {
                const targetTime = e.data.currentTime;
                const shouldPlay = e.data.isPlaying;
                const videos = document.querySelectorAll('video');
                videos.forEach(function(vid) {
                  if (typeof targetTime === 'number' && Math.abs(vid.currentTime - targetTime) > 1.2) {
                    vid.currentTime = targetTime;
                  }
                  if (shouldPlay && vid.paused) {
                    vid.play().catch(function(){});
                  } else if (!shouldPlay && !vid.paused) {
                    vid.pause();
                  }
                });
              }
            });

            // Notify parent when DOM finishes loading
            window.addEventListener('load', function() {
              if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'VIRTUAL_BROWSER_URL_CHANGED', url: ${jsString(finalUrl)} }, '*');
              }
            });
          })();
        </script>
      `;

      // Rewrite child iframe src attributes to route through /api/proxy-web so inner video elements are ALSO proxied and intercepted!
      html = html.replace(/<iframe\s+([^>]*?)src=["'](https?:\/\/[^"']+)["']/gi, (match, prefix, iframeSrc) => {
        const proxiedIframeSrc = `/api/proxy-web?url=${encodeURIComponent(iframeSrc)}&roomId=${encodedRoomId}`;
        return `<iframe ${prefix}src="${proxiedIframeSrc}"`;
      });

      if (html.includes('<head>')) {
        html = html.replace('<head>', `<head>${syncScript}`);
      } else {
        html = syncScript + html;
      }
      return res.send(html);
    }

    res.status(response.status).setHeader('Content-Type', contentType);
    for (const header of ['content-length', 'content-range', 'accept-ranges', 'cache-control']) {
      const value = response.headers.get(header);
      if (value) res.setHeader(header, value);
    }
    if (!response.body) return res.end();
    Readable.fromWeb(response.body as any).on('error', () => res.destroy()).pipe(res);
  } catch (err: any) {
    console.error('Virtual browser proxy error:', err);
    res.status(502).send('No se pudo cargar el sitio externo.');
  }
});

// Vite Integration
async function startServer() {
  const requestedPort = Number(process.env.PORT) || 3000;
  const allowPortFallback = process.env.NODE_ENV !== 'production' && !process.env.PORT;
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: process.env.DISABLE_HMR !== 'true' ? { server: httpServer } : false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  const listen = (port: number, attempts = 0): Promise<number> => new Promise((resolve, reject) => {
    const onListening = () => {
      httpServer.off('error', onError);
      const address = httpServer.address();
      resolve(typeof address === 'object' && address ? address.port : port);
    };
    const onError = (error: NodeJS.ErrnoException) => {
      httpServer.off('listening', onListening);
      if (error.code === 'EADDRINUSE' && allowPortFallback && attempts < 20) {
        console.warn(`Port ${port} is busy; trying ${port + 1}.`);
        resolve(listen(port + 1, attempts + 1));
        return;
      }
      reject(error);
    };
    httpServer.once('listening', onListening);
    httpServer.once('error', onError);
    httpServer.listen(port);
  });

  try {
    const activePort = await listen(requestedPort);
    console.log(`🎬 Watch2Gether Server running on http://0.0.0.0:${activePort}`);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    console.error(`Unable to start on port ${requestedPort}${code === 'EADDRINUSE' ? ': port is already in use. Set PORT to an available port.' : ''}.`, error);
    process.exitCode = 1;
  }
}

const shutdown = () => {
  httpServer.close(() => {
    void remoteBrowserManager.close().finally(() => process.exit(0));
  });
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

startServer();
