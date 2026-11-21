import type express from 'express';
import { Readable } from 'node:stream';
import net from 'node:net';
import {
  getAlbumDetails,
  getArtistDetails,
  getGenreCatalog,
  getMusicHome,
  getMusicRadios,
  getPlaylistDetails,
  getTrackLyrics,
  resolveTrackPlayback,
  searchMusicCatalog,
} from '../services/riffanMusicService.ts';

function isPrivateOrDisallowedHost(hostname: string): boolean {
  const low = hostname.trim().toLowerCase();
  if (!low || low === 'localhost' || low.endsWith('.local') || low.endsWith('.internal')) {
    return true;
  }
  const ipVer = net.isIP(low);
  if (ipVer === 4) {
    const parts = low.split('.').map(Number);
    if (
      parts[0] === 10 ||
      parts[0] === 127 ||
      parts[0] === 0 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168)
    ) {
      return true;
    }
  }
  if (ipVer === 6 && (low === '::1' || low.startsWith('fc') || low.startsWith('fd') || low.startsWith('fe80'))) {
    return true;
  }
  return false;
}

export function registerMusicRoutes(app: express.Express): void {
  app.get('/api/music/home', async (_req, res) => {
    try {
      const data = await getMusicHome();
      res.setHeader('Cache-Control', 'public, max-age=180');
      res.json({ success: true, ...data });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to load music home' });
    }
  });

  app.get('/api/music/search', async (req, res) => {
    const q = String(req.query.q || '').trim();
    const type = String(req.query.type || 'all').trim();
    if (!q) {
      res.json({ success: true, tracks: [], albums: [], artists: [], playlists: [], radios: [] });
      return;
    }
    try {
      const data = await searchMusicCatalog(q, type);
      res.setHeader('Cache-Control', 'public, max-age=120');
      res.json({ success: true, ...data });
    } catch {
      res.status(500).json({ success: false, error: 'Music search failed' });
    }
  });

  app.get('/api/music/album/:id', async (req, res) => {
    try {
      const data = await getAlbumDetails(String(req.params.id || ''));
      if (!data) {
        res.status(404).json({ success: false, error: 'Album not found' });
        return;
      }
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json({ success: true, ...data });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to load album' });
    }
  });

  app.get('/api/music/artist/:id', async (req, res) => {
    try {
      const data = await getArtistDetails(String(req.params.id || ''));
      if (!data) {
        res.status(404).json({ success: false, error: 'Artist not found' });
        return;
      }
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json({ success: true, ...data });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to load artist' });
    }
  });

  app.get('/api/music/playlist/:id', async (req, res) => {
    try {
      const data = await getPlaylistDetails(String(req.params.id || ''));
      if (!data) {
        res.status(404).json({ success: false, error: 'Playlist not found' });
        return;
      }
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json({ success: true, ...data });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to load playlist' });
    }
  });

  app.get('/api/music/genre/:id', async (req, res) => {
    try {
      const name = String(req.query.name || '').trim();
      const data = await getGenreCatalog(String(req.params.id || '0'), name);
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json({ success: true, ...data });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to load genre catalog' });
    }
  });

  app.get('/api/music/radios', async (req, res) => {
    try {
      const country = String(req.query.country || 'ES').trim();
      const radios = await getMusicRadios(country);
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json({ success: true, radios });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to load radios' });
    }
  });

  app.get('/api/music/lyrics', async (req, res) => {
    const artist = String(req.query.artist || '').trim();
    const title = String(req.query.title || '').trim();
    const album = String(req.query.album || '').trim() || undefined;
    const durationSec = Number(req.query.duration || 0) || undefined;
    if (!artist || !title) {
      res.json({ success: true, found: false, synced: false, lines: [] });
      return;
    }
    try {
      const lyrics = await getTrackLyrics({ artist, title, album, durationSec });
      res.setHeader('Cache-Control', 'public, max-age=600');
      res.json({ success: true, ...lyrics });
    } catch {
      res.json({ success: true, found: false, synced: false, lines: [] });
    }
  });

  app.get('/api/music/play', async (req, res) => {
    const title = String(req.query.title || '').trim();
    const artist = String(req.query.artist || '').trim();
    if (!title || !artist) {
      res.status(400).json({ success: false, error: 'Missing title or artist' });
      return;
    }
    try {
      const resolved = await resolveTrackPlayback({
        title,
        artist,
        durationSec: Number(req.query.duration || 0) || undefined,
        previewUrl: String(req.query.preview || '').trim() || undefined,
        soundcloudId: String(req.query.scId || '').trim() || undefined,
        audiusId: String(req.query.audiusId || '').trim() || undefined,
        youtubeVideoId: String(req.query.ytId || '').trim() || undefined,
      });
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, ...resolved });
    } catch {
      res.status(500).json({ success: false, error: 'Playback resolution failed' });
    }
  });

  app.get('/api/music/stream-proxy', async (req, res) => {
    const rawUrl = String(req.query.url || '').trim();
    if (!rawUrl) {
      res.status(400).send('Missing url');
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      res.status(400).send('Invalid url');
      return;
    }
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || isPrivateOrDisallowedHost(parsed.hostname)) {
      res.status(403).send('Forbidden url');
      return;
    }

    const controller = new AbortController();
    req.on('close', () => controller.abort());

    try {
      const upstreamHeaders: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
      };
      if (req.headers.range) {
        upstreamHeaders.Range = String(req.headers.range);
      }
      const upstream = await fetch(parsed.toString(), {
        headers: upstreamHeaders,
        redirect: 'follow',
        signal: controller.signal,
      });

      if (!upstream.ok && upstream.status !== 206) {
        res.status(upstream.status).send('Upstream audio error');
        return;
      }

      const contentType = upstream.headers.get('content-type') || 'audio/mpeg';
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

      if (
        contentType.includes('mpegurl') ||
        parsed.pathname.toLowerCase().endsWith('.m3u8')
      ) {
        const text = await upstream.text();
        const base = upstream.url || parsed.toString();
        const rewritten = text
          .split('\n')
          .map((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) {
              return line.replace(/URI="([^"]+)"/gi, (_m, u) => {
                try {
                  const abs = new URL(u, base).toString();
                  return `URI="/api/music/stream-proxy?url=${encodeURIComponent(abs)}"`;
                } catch {
                  return `URI="${u}"`;
                }
              });
            }
            try {
              const abs = new URL(trimmed, base).toString();
              return `/api/music/stream-proxy?url=${encodeURIComponent(abs)}`;
            } catch {
              return line;
            }
          })
          .join('\n');
        res.status(200);
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.send(rewritten);
        return;
      }

      res.status(upstream.status);
      res.setHeader('Content-Type', contentType);
      const acceptRanges = upstream.headers.get('accept-ranges');
      if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
      const contentRange = upstream.headers.get('content-range');
      if (contentRange) res.setHeader('Content-Range', contentRange);
      const contentLength = upstream.headers.get('content-length');
      if (contentLength) res.setHeader('Content-Length', contentLength);

      if (!upstream.body) {
        res.end();
        return;
      }
      const nodeStream = Readable.fromWeb(upstream.body as unknown as import('node:stream/web').ReadableStream);
      nodeStream.on('error', () => {
        if (!res.headersSent) res.status(502);
        res.end();
      });
      nodeStream.pipe(res);
    } catch {
      if (!res.headersSent) {
        res.status(502).send('Audio proxy failed');
      }
    }
  });
}
