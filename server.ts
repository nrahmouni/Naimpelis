import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

app.use(express.json());

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
    messages: any[];
    createdAt: number;
  };
}

const rooms: RoomStore = {
  'cinema-pro': {
    id: 'cinema-pro',
    name: 'Sala de Cine Principal 🍿',
    hostId: 'system',
    videoState: {
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      title: 'Big Buck Bunny (4K)',
      sourceType: 'direct',
      currentTime: 0,
      isPlaying: false,
      lastUpdated: Date.now(),
    },
    participants: [],
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
};

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

function broadcastToRoom(roomId: string, message: any, excludeWs?: WebSocket) {
  const payload = JSON.stringify(message);
  clients.forEach((meta, ws) => {
    if (meta.roomId === roomId && ws.readyState === WebSocket.OPEN && ws !== excludeWs) {
      ws.send(payload);
    }
  });
}

function getOrCreateRoom(roomId: string, roomName?: string) {
  if (!rooms[roomId]) {
    rooms[roomId] = {
      id: roomId,
      name: roomName || `Sala ${roomId.substring(0, 6)}`,
      hostId: '',
      videoState: {
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        title: 'Big Buck Bunny (4K)',
        sourceType: 'direct',
        currentTime: 0,
        isPlaying: false,
        lastUpdated: Date.now(),
      },
      participants: [],
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

wss.on('connection', (ws) => {
  clients.set(ws, { ws });

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      const { type, payload } = data;

      if (type === 'JOIN_ROOM') {
        const { roomId, userId, userName, userAvatar, userColor } = payload;
        const room = getOrCreateRoom(roomId);

        // Assign host if first or existing host left
        if (!room.hostId || room.participants.length === 0) {
          room.hostId = userId;
        }

        const isHost = room.hostId === userId;
        
        // Remove duplicate entry if reconnection
        room.participants = room.participants.filter(p => p.id !== userId);
        const newParticipant = {
          id: userId,
          name: userName || 'Invitado',
          avatar: userAvatar || '🍿',
          color: userColor || '#3b82f6',
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
            payload: room,
          })
        );

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
      } else if (type === 'SYNC_VIDEO_STATE') {
        const { roomId, action, videoUrl, videoTitle, sourceType, currentTime, isPlaying, updatedBy, poster, overview, releaseYear, originalPortalUrl, altEmbeds, trailerUrl } = payload;
        const room = rooms[roomId];
        if (!room) return;

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
        room.videoState.updatedBy = updatedBy;

        let systemMsgText = '';
        if (action === 'change_url') {
          systemMsgText = `🎬 ${updatedBy || 'Un usuario'} cambió el vídeo a "${videoTitle || 'nuevo vídeo'}"`;
        } else if (action === 'play') {
          systemMsgText = `▶️ ${updatedBy || 'Un usuario'} reprodujo el vídeo`;
        } else if (action === 'pause') {
          systemMsgText = `⏸️ ${updatedBy || 'Un usuario'} pausó el vídeo`;
        } else if (action === 'seek') {
          systemMsgText = `⏩ ${updatedBy || 'Un usuario'} saltó a otra parte del vídeo`;
        }

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
          room.messages.push(sysMsg);
          if (room.messages.length > 150) room.messages.shift();
        }

        broadcastToRoom(roomId, {
          type: 'VIDEO_STATE_UPDATED',
          payload: {
            videoState: room.videoState,
            action,
            messages: room.messages,
          },
        });
      } else if (type === 'SEND_CHAT') {
        const { roomId, text, senderId, senderName, senderAvatar, senderColor } = payload;
        const room = rooms[roomId];
        if (!room || !text.trim()) return;

        const newMsg = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          senderId,
          senderName,
          senderAvatar,
          senderColor,
          text: text.trim(),
          timestamp: Date.now(),
        };

        room.messages.push(newMsg);
        if (room.messages.length > 150) room.messages.shift();

        broadcastToRoom(roomId, {
          type: 'NEW_CHAT_MESSAGE',
          payload: newMsg,
        });
      } else if (type === 'SEND_REACTION') {
        const { roomId, emoji, senderName, senderColor } = payload;
        const room = rooms[roomId];
        if (!room) return;

        const reaction = {
          id: `react-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          emoji,
          senderName,
          senderColor,
          timestamp: Date.now(),
        };

        broadcastToRoom(roomId, {
          type: 'FLOATING_REACTION',
          payload: reaction,
        });
      } else if (type === 'WEBRTC_SIGNAL') {
        const { roomId, signalData, targetId, senderId } = payload;
        broadcastToRoom(roomId, {
          type: 'WEBRTC_SIGNAL',
          payload: {
            signalData,
            targetId,
            senderId,
          },
        }, ws);
      } else if (type === 'TRANSFER_HOST') {
        const { roomId, newHostId } = payload;
        const room = rooms[roomId];
        if (!room) return;

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

        broadcastToRoom(roomId, {
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

    if (meta && meta.roomId && meta.userId) {
      const room = rooms[meta.roomId];
      if (room) {
        room.participants = room.participants.filter((p) => p.id !== meta.userId);
        
        // Host migration if host left
        if (room.hostId === meta.userId && room.participants.length > 0) {
          room.hostId = room.participants[0].id;
          room.participants[0].isHost = true;
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
  const roomId = `room-${Math.random().toString(36).substring(2, 8)}`;
  const room = getOrCreateRoom(roomId, name);
  res.json(room);
});

// Movie Resolver: Automatically recognizes movie URLs (like bingetrix.sc/watch/1423191, tmdb, etc.)
app.get('/api/resolve-movie', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const queryUrl = (req.query.url as string) || '';
  if (!queryUrl) {
    return res.status(400).json({ success: false, error: 'Missing url parameter' });
  }

  try {
    // Check if it's a Bingetrix URL (e.g. bingetrix.sc/watch/1423191) or default TMDB ID
    const bingetrixMatch = queryUrl.match(/(?:bingetrix\.[a-z]+\/(?:watch|movie|tv)\/|tmdb\/|movie\/)(\d+)/i);
    const tmdbId = bingetrixMatch ? bingetrixMatch[1] : '1423191';
    const tmdbApiKey = '90b2cae8d7161e8ba0f3836240d7d352';

    // Query TMDB for movie details & trailers
    const [movieRes, videosRes] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${tmdbApiKey}&language=es-ES`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(`https://api.themoviedb.org/3/movie/${tmdbId}/videos?api_key=${tmdbApiKey}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]);

    const title = movieRes?.title || movieRes?.name || movieRes?.original_title || 'Resident Evil';
    const overview = movieRes?.overview || 'Película de terror y acción.';
    const poster = movieRes?.poster_path ? `https://image.tmdb.org/t/p/w500${movieRes.poster_path}` : '';
    const releaseYear = movieRes?.release_date ? movieRes.release_date.split('-')[0] : '2026';

    const videos = (videosRes as any)?.results || [];
    const trailer = videos.find((v: any) => v.site === 'YouTube' && v.type === 'Trailer') ||
                    videos.find((v: any) => v.site === 'YouTube');
    const trailerKey = trailer?.key || '';
    const trailerUrl = trailerKey ? `https://www.youtube.com/watch?v=${trailerKey}` : '';

    const streamEmbeds = [
      `https://vidsrc.me/embed/movie/${tmdbId}`,
      `https://vidsrc.to/embed/movie/${tmdbId}`,
      `https://autoembed.to/movie/tmdb/${tmdbId}`,
    ];

    return res.json({
      success: true,
      type: 'movie_portal',
      tmdbId,
      title,
      overview,
      poster,
      releaseYear,
      trailerUrl,
      streamEmbeds,
      originalUrl: queryUrl,
    });
  } catch (err: any) {
    console.error('Error resolving movie URL:', err);
    return res.status(500).json({ success: false, error: 'Failed to resolve movie URL' });
  }
});

// Movie Catalog Search Endpoint for Virtual Browser Movie Finder
app.get('/api/search-movies', async (req, res) => {
  const query = (req.query.query as string) || '';
  const tmdbApiKey = '90b2cae8d7161e8ba0f3836240d7d352';

  try {
    const searchUrl = query.trim()
      ? `https://api.themoviedb.org/3/search/multi?api_key=${tmdbApiKey}&language=es-ES&query=${encodeURIComponent(query)}&page=1`
      : `https://api.themoviedb.org/3/trending/movie/week?api_key=${tmdbApiKey}&language=es-ES`;

    const r = await fetch(searchUrl);
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

        // Working stream embeds
        const streamUrl = isTv
          ? `https://vidsrc.pm/embed/tv/${id}/1/1`
          : `https://vidsrc.pm/embed/movie/${id}`;

        const bingetrixUrl = `https://bingetrix.sc/watch/${id}`;
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
          streamUrl,
          bingetrixUrl,
          movidyUrl,
        };
      });

    res.json({ results: items });
  } catch (err: any) {
    console.error('Search movies error:', err);
    res.status(500).json({ error: 'Error al buscar películas' });
  }
});

// Virtual Chrome Browser Proxy: strips framing restrictions, blocks intrusive redirects and injects sync bridge
app.get('/api/proxy-web', async (req, res) => {
  const targetUrl = (req.query.url as string) || '';
  const roomId = (req.query.roomId as string) || '';
  
  // Check if URL is incomplete or missing a proper TLD extension
  const hasValidTld = /\.[a-z]{2,}(\/|$)/i.test(targetUrl);
  if (!targetUrl || !hasValidTld) {
    return res.status(200).send(`
      <div style="background:#090d16;color:#e2e8f0;padding:24px;font-family:sans-serif;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">
        <h3 style="margin-bottom:8px;color:#f87171;">Introduce una dirección web válida</h3>
        <p style="color:#94a3b8;font-size:13px;max-width:400px;margin-bottom:16px;">Escribe un dominio completo con su extensión (ej: movidy.pw) o usa el buscador de películas.</p>
        <a href="/api/proxy-web?url=${encodeURIComponent('https://movidy.pw/')}&roomId=${encodeURIComponent(roomId)}" style="background:#2563eb;color:white;padding:10px 20px;border-radius:12px;text-decoration:none;font-size:13px;font-weight:bold;">Ir a Movidy.pw</a>
      </div>
    `);
  }

  try {
    let finalUrl = targetUrl;
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = 'https://' + finalUrl;
    }
    const parsed = new URL(finalUrl);
    const response = await fetch(finalUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      },
    });

    const contentType = response.headers.get('content-type') || 'text/html';
    res.setHeader('Content-Type', contentType);
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');

    if (contentType.includes('text/html')) {
      let html = await response.text();

      // Interceptor script injected into virtual browser:
      // 1. Intercepts link clicks and form submits, converting them to proxy URLs
      // 2. Notifies parent Watch2Gether app of URL changes so other users navigate simultaneously
      // 3. Intercepts HTML5 video play, pause, seek and timeupdate events to synchronize playback across room
      // 4. Blocks popunder and intrusive new window redirects (window.open = noop)
      const syncScript = `
        <base href="${parsed.origin}/">
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
                  let resolved = new URL(href, "${finalUrl}").href;
                  if (window.parent && window.parent !== window) {
                    window.parent.postMessage({ type: 'VIRTUAL_BROWSER_NAVIGATE', url: resolved }, '*');
                  }
                  window.location.href = '/api/proxy-web?url=' + encodeURIComponent(resolved) + '&roomId=${roomId}';
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
                window.parent.postMessage({ type: 'VIRTUAL_BROWSER_URL_CHANGED', url: "${finalUrl}" }, '*');
              }
            });
          })();
        </script>
      `;

      // Rewrite child iframe src attributes to route through /api/proxy-web so inner video elements are ALSO proxied and intercepted!
      html = html.replace(/<iframe\s+([^>]*?)src=["'](https?:\/\/[^"']+)["']/gi, (match, prefix, iframeSrc) => {
        const proxiedIframeSrc = `/api/proxy-web?url=${encodeURIComponent(iframeSrc)}&roomId=${roomId}`;
        return `<iframe ${prefix}src="${proxiedIframeSrc}"`;
      });

      if (html.includes('<head>')) {
        html = html.replace('<head>', `<head>${syncScript}`);
      } else {
        html = syncScript + html;
      }
      return res.send(html);
    }

    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err: any) {
    console.error('Virtual browser proxy error:', err);
    res.status(200).send(`
      <div style="background:#090d16;color:#e2e8f0;padding:24px;font-family:sans-serif;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">
        <h3 style="margin-bottom:8px;color:#f87171;">Cargando Movidy / Portal Externo</h3>
        <p style="color:#94a3b8;font-size:13px;max-width:400px;margin-bottom:16px;">El sitio externo puede requerir apertura directa o estar protegido contra incrustación por proxy.</p>
        <a href="${targetUrl}" target="_blank" style="background:#2563eb;color:white;padding:10px 20px;border-radius:12px;text-decoration:none;font-size:13px;font-weight:bold;box-shadow:0 4px 12px rgba(37,99,235,0.4);">Abrir Portal en Pestaña Nueva</a>
      </div>
    `);
  }
});

// Vite Integration
async function startServer() {
  const PORT = process.env.PORT || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  httpServer.listen(PORT, () => {
    console.log(`🎬 Watch2Gether Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
