import type express from 'express';
import { Readable } from 'node:stream';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import {
  getAlbumDetails,
  getArtistDetails,
  getGenreCatalog,
  getMusicHome,
  getMusicRadios,
  getPlaylistDetails,
  getRelatedGenreTracks,
  getTrackLyrics,
  resolveTrackPlayback,
  searchMusicCatalog,
  warmMusicPlaybackEngine,
} from '../services/riffanMusicService.ts';
import {
  importExternalMusicUrl,
  matchImportedTracksBatch,
} from '../services/musicPlatformSync.ts';
import {
  createSpotifyAuthorizeUrl,
  getSpotifyOAuthStatus,
  handleSpotifyOAuthCallback,
  importFullSpotifyAccount,
  importFullYoutubeAccount,
  SPOTIFY_CALLBACK_PATH,
} from '../services/musicOAuthImporter.ts';
import {
  safeFetchFollowingRedirects,
  validateSafeOutboundUrl,
} from '../utils/ssrfGuard.ts';

let cachedFfmpegBin: string | null = null;
function resolveFfmpegBin(): string {
  if (cachedFfmpegBin) return cachedFfmpegBin;
  try {
    const sysCheck = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore', timeout: 2500 });
    if (sysCheck.status === 0) {
      cachedFfmpegBin = 'ffmpeg';
      return cachedFfmpegBin;
    }
  } catch {
    // fallback to bundled binary
  }
  cachedFfmpegBin = ffmpegInstaller?.path || 'ffmpeg';
  return cachedFfmpegBin;
}

// Per-IP sliding window rate limiter & max-3 concurrent FFmpeg job semaphore
const downloadRateMap = new Map<string, number[]>();
const MAX_DOWNLOAD_PER_MIN = 16;
let activeFfmpegJobs = 0;
const MAX_CONCURRENT_FFMPEG = 3;

function checkDownloadRateLimit(ip: string): boolean {
  const now = Date.now();
  const prev = (downloadRateMap.get(ip) || []).filter((t) => now - t < 60_000);
  if (prev.length >= MAX_DOWNLOAD_PER_MIN) {
    downloadRateMap.set(ip, prev);
    return false;
  }
  prev.push(now);
  downloadRateMap.set(ip, prev);
  if (downloadRateMap.size > 500) {
    for (const [k, v] of downloadRateMap.entries()) {
      if (v.every((t) => now - t >= 60_000)) downloadRateMap.delete(k);
    }
  }
  return true;
}

const EQ_10_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36';

export function registerMusicRoutes(app: express.Express): void {
  void warmMusicPlaybackEngine();

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
      const countOf = (v: unknown) => (Array.isArray(v) ? v.length : 0);
      const hasAny =
        countOf(data.tracks) +
          countOf(data.albums) +
          countOf(data.artists) +
          countOf(data.playlists) +
          countOf(data.radios) >
        0;
      res.setHeader('Cache-Control', hasAny ? 'public, max-age=120' : 'no-store');
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

  app.get('/api/music/related', async (req, res) => {
    const title = String(req.query.title || '').trim();
    const artist = String(req.query.artist || '').trim();
    if (!title && !artist) {
      res.status(400).json({ success: false, error: 'Missing title or artist', tracks: [] });
      return;
    }
    const trackId = String(req.query.trackId || '').trim() || undefined;
    const album = String(req.query.album || '').trim() || undefined;
    const excludeRaw = String(req.query.exclude || '').trim();
    const excludeIds = excludeRaw ? excludeRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const limit = Number(req.query.limit || 22) || 22;
    try {
      const data = await getRelatedGenreTracks({
        trackId,
        title,
        artist,
        album,
        excludeIds,
        limit,
      });
      res.setHeader('Cache-Control', 'public, max-age=180');
      res.json({ success: true, ...data });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to load related genre tracks', tracks: [] });
    }
  });

  app.get('/api/music/radios', async (req, res) => {
    try {
      const country = String(req.query.country || 'ALL').trim();
      const tag = String(req.query.tag || '').trim() || undefined;
      const radios = await getMusicRadios(country, tag);
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
    const preferAudio = req.query.preferAudio === '1' || req.query.preferAudio === 'true';
    try {
      const resolved = await resolveTrackPlayback({
        trackId: String(req.query.trackId || '').trim() || undefined,
        title,
        artist,
        durationSec: Number(req.query.duration || 0) || undefined,
        previewUrl: String(req.query.preview || '').trim() || undefined,
        soundcloudId: String(req.query.scId || '').trim() || undefined,
        audiusId: String(req.query.audiusId || '').trim() || undefined,
        youtubeVideoId: String(req.query.ytId || '').trim() || undefined,
        isrc: String(req.query.isrc || '').trim() || undefined,
        preferAudio,
      });
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, ...resolved });
    } catch {
      res.status(500).json({ success: false, error: 'Playback resolution failed' });
    }
  });

  // External Spotify / YouTube Music playlist/album link importer
  app.post('/api/music/import-external', async (req, res) => {
    const rawUrl = String(req.body?.url || '').trim();
    if (!rawUrl) {
      res.status(400).json({ ok: false, error: 'Missing url' });
      return;
    }
    const check = await validateSafeOutboundUrl(rawUrl);
    if (!check.safe) {
      res.status(check.status).json({ ok: false, error: check.reason });
      return;
    }
    try {
      const result = await importExternalMusicUrl(check.url.toString());
      res.setHeader('Cache-Control', 'no-store');
      res.status(result.ok ? 200 : 422).json(result);
    } catch {
      res.status(500).json({ ok: false, error: 'External import failed' });
    }
  });

  // Batch enrich imported tracks (Spotify Privacy JSON / Google Takeout / CSV / M3U)
  app.post('/api/music/match-tracks', async (req, res) => {
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
    if (rawItems.length === 0) {
      res.status(400).json({ success: false, error: 'Missing track items', tracks: [] });
      return;
    }
    try {
      const tracks = await matchImportedTracksBatch(rawItems);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, tracks });
    } catch {
      res.status(500).json({ success: false, error: 'Batch match failed', tracks: [] });
    }
  });

  // Spotify 3P OAuth Status, Authorize URL, Callback (postMessage) & Full Library Import
  app.get('/api/music/oauth/spotify/status', (req, res) => {
    const origin = String(req.query.origin || '').trim() || undefined;
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, ...getSpotifyOAuthStatus(origin) });
  });

  app.get('/api/music/oauth/spotify/url', (req, res) => {
    const origin = String(req.query.origin || '').trim() || undefined;
    const result = createSpotifyAuthorizeUrl(origin);
    res.setHeader('Cache-Control', 'no-store');
    if (!result.ok || !result.url) {
      res.status(503).json({ success: false, error: result.error || 'Spotify OAuth unavailable' });
      return;
    }
    res.json({ success: true, url: result.url });
  });

  app.get([SPOTIFY_CALLBACK_PATH, `${SPOTIFY_CALLBACK_PATH}/`], async (req, res) => {
    const result = await handleSpotifyOAuthCallback({
      code: typeof req.query.code === 'string' ? req.query.code : undefined,
      state: typeof req.query.state === 'string' ? req.query.state : undefined,
      error: typeof req.query.error === 'string' ? req.query.error : undefined,
    });

    const payloadJson = JSON.stringify(
      result.ok
        ? { type: 'SPOTIFY_OAUTH_SUCCESS', sessionToken: result.sessionToken }
        : { type: 'SPOTIFY_OAUTH_ERROR', error: result.error || 'OAuth failed' }
    ).replace(/</g, '\\u003c');

    const targetOriginJson = JSON.stringify(result.openerOrigin || '*').replace(/</g, '\\u003c');
    const statusText = result.ok
      ? 'Spotify conectado. Importando tus gustos a Riffan Music...'
      : 'No se pudo completar la conexión con Spotify.';

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html>
<html lang="es">
  <head><meta charset="utf-8" /><title>Riffan Music · Spotify</title></head>
  <body style="background:#000;color:#fff;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center">
    <div>
      <p style="font-weight:700;font-size:15px">${statusText}</p>
      <p style="color:#a1a1aa;font-size:13px">Esta ventana se cerrará automáticamente.</p>
    </div>
    <script>
      (function() {
        var payload = ${payloadJson};
        var targetOrigin = ${targetOriginJson};
        try {
          if (window.opener) {
            window.opener.postMessage(payload, targetOrigin);
            setTimeout(function() { window.close(); }, 250);
          } else {
            window.location.href = '/musica';
          }
        } catch (e) {
          try {
            if (window.opener) window.opener.postMessage(payload, '*');
          } catch (_) {}
          setTimeout(function() { window.close(); }, 300);
        }
      })();
    </script>
  </body>
</html>`);
  });

  app.post('/api/music/oauth/spotify/import', async (req, res) => {
    const authHeader = String(req.headers.authorization || '').trim();
    const match = authHeader.match(/^Bearer\s+([^\s]+)$/i);
    if (!match?.[1]) {
      res.status(401).json({ ok: false, error: 'Missing Spotify session token' });
      return;
    }
    try {
      const payload = await importFullSpotifyAccount(match[1]);
      res.setHeader('Cache-Control', 'no-store');
      res.status(payload.ok ? 200 : 401).json(payload);
    } catch {
      res.status(500).json({ ok: false, error: 'Failed to import Spotify account library' });
    }
  });

  app.post('/api/music/oauth/youtube/import', async (req, res) => {
    const authHeader = String(req.headers.authorization || '').trim();
    const match = authHeader.match(/^Bearer\s+([^\s]+)$/i);
    if (!match?.[1]) {
      res.status(401).json({ ok: false, error: 'Missing Google YouTube access token' });
      return;
    }
    try {
      const payload = await importFullYoutubeAccount(match[1]);
      res.setHeader('Cache-Control', 'no-store');
      res.status(payload.ok ? 200 : 422).json(payload);
    } catch {
      res.status(500).json({ ok: false, error: 'Failed to import YouTube Music library' });
    }
  });

  // Secure image proxy with SSRF DNS check + 24h caching
  app.get('/api/music/image-proxy', async (req, res) => {
    const rawUrl = String(req.query.url || '').trim();
    if (!rawUrl) {
      res.status(400).send('Missing url');
      return;
    }
    const check = await validateSafeOutboundUrl(rawUrl);
    if (!check.safe) {
      res.status(check.status).send(check.reason);
      return;
    }

    try {
      const { response: upstream } = await safeFetchFollowingRedirects(check.url.toString(), {
        headers: { 'User-Agent': USER_AGENT, Accept: 'image/*,*/*;q=0.8' },
        signal: AbortSignal.timeout(6000),
      });
      if (!upstream.ok) {
        void upstream.body?.cancel().catch(() => {});
        res.status(upstream.status).send('Image fetch error');
        return;
      }
      const ct = (upstream.headers.get('content-type') || '').toLowerCase();
      if (!ct.startsWith('image/')) {
        void upstream.body?.cancel().catch(() => {});
        res.status(415).send('Unsupported content type');
        return;
      }
      const len = Number(upstream.headers.get('content-length') || 0);
      if (len > 8 * 1024 * 1024) {
        void upstream.body?.cancel().catch(() => {});
        res.status(413).send('Image too large');
        return;
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Type', ct);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(buf);
    } catch (err: unknown) {
      const code = (err as { statusCode?: number })?.statusCode || 502;
      res.status(code).send('Image proxy failed');
    }
  });

  app.get('/api/music/stream-proxy', async (req, res) => {
    const rawUrl = String(req.query.url || '').trim();
    if (!rawUrl) {
      res.status(400).send('Missing url');
      return;
    }

    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });

    try {
      const upstreamHeaders: Record<string, string> = {
        'User-Agent': USER_AGENT,
      };
      if (req.headers.range) {
        upstreamHeaders.Range = String(req.headers.range);
      }
      const { response: upstream, finalUrl } = await safeFetchFollowingRedirects(
        rawUrl,
        {
          headers: upstreamHeaders,
          signal: controller.signal,
        }
      );

      if (!upstream.ok && upstream.status !== 206) {
        void upstream.body?.cancel().catch(() => {});
        res.status(upstream.status).send('Upstream audio error');
        return;
      }

      const contentType = upstream.headers.get('content-type') || 'audio/mpeg';
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

      let parsedPath = '';
      try {
        parsedPath = new URL(finalUrl || rawUrl).pathname.toLowerCase();
      } catch {
        parsedPath = '';
      }

      if (contentType.includes('mpegurl') || parsedPath.endsWith('.m3u8')) {
        const text = await upstream.text();
        const base = finalUrl || rawUrl;
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
        res.setHeader('Cache-Control', 'private, max-age=120');
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
      if (/\.(m4s|mp4|aac|mp3|ts|m4a)$/.test(parsedPath)) {
        res.setHeader('Cache-Control', 'private, max-age=300');
      }

      if (!upstream.body) {
        res.end();
        return;
      }
      const nodeStream = Readable.fromWeb(
        upstream.body as unknown as import('node:stream/web').ReadableStream
      );
      nodeStream.on('error', () => {
        if (!res.headersSent) res.status(502);
        if (!res.writableEnded) res.end();
      });
      req.on('close', () => {
        if (!res.writableEnded && !nodeStream.destroyed) nodeStream.destroy();
      });
      nodeStream.pipe(res);
    } catch (err: unknown) {
      const code = (err as { statusCode?: number })?.statusCode || 502;
      if (!res.headersSent) {
        res.status(code).send('Audio proxy failed');
      }
    }
  });

  app.get('/api/music/download-mp3', async (req, res) => {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    if (!checkDownloadRateLimit(clientIp)) {
      res.status(429).json({
        success: false,
        error: 'Demasiadas descargas por minuto. Espera unos segundos.',
      });
      return;
    }
    if (activeFfmpegJobs >= MAX_CONCURRENT_FFMPEG) {
      res.status(429).json({
        success: false,
        error: 'Servidor ocupado procesando otros MP3. Reintenta en unos segundos.',
      });
      return;
    }

    const title = String(req.query.title || '').trim();
    const artist = String(req.query.artist || '').trim();
    if (!title || !artist) {
      res.status(400).json({ success: false, error: 'Missing title or artist' });
      return;
    }

    const mode = String(req.query.mode || 'original').trim().toLowerCase();
    const bitrateRaw = String(req.query.bitrate || '320k').trim().toLowerCase();
    const bitrate = bitrateRaw === '128k' || bitrateRaw === '192k' ? bitrateRaw : '320k';
    const trajectory = String(req.query.trajectory || 'orbit').trim().toLowerCase();
    const rawRate = Number(req.query.rate || 1);
    const rate = Number.isFinite(rawRate) ? Math.min(1.45, Math.max(0.65, rawRate)) : 1;
    const rawPitch = Number(req.query.pitchSemitones || 0);
    const pitchSemitones = Number.isFinite(rawPitch) ? Math.min(12, Math.max(-12, rawPitch)) : 0;
    const rawBass = Number(req.query.bassDb || 0);
    const bassDb = Number.isFinite(rawBass) ? Math.min(12, Math.max(0, rawBass)) : 0;
    const rawReverb = Number(req.query.reverbMix || 0);
    const reverbMix = Number.isFinite(rawReverb) ? Math.min(0.75, Math.max(0, rawReverb)) : 0;
    const vocalCancel = req.query.vocalCancel === '1' || req.query.vocalCancel === 'true';
    const exciterMix = Math.min(1, Math.max(0, Number(req.query.exciterMix || 0) || 0));
    const speed8dSec = Math.min(20, Math.max(3, Number(req.query.speed8dSec || 9.5) || 9.5));
    const trimStart = Math.max(0, Number(req.query.trimStart || 0) || 0);
    const trimEnd = Math.max(0, Number(req.query.trimEnd || 0) || 0);
    const fadeSec = Math.min(10, Math.max(0, Number(req.query.fadeSec || 0) || 0));
    const coverUrl = String(req.query.coverUrl || '').trim();
    const albumName = String(req.query.album || 'Riffan Music Studio').trim().slice(0, 120);
    const withLyrics = req.query.withLyrics === '1' || req.query.withLyrics === 'true';

    // Parse optional 10-band EQ CSV
    const eqGains = String(req.query.eq || '')
      .split(',')
      .slice(0, 10)
      .map((v) => {
        const n = Number(v);
        return Number.isFinite(n) ? Math.min(12, Math.max(-12, n)) : 0;
      });

    let coverTmpPath: string | null = null;
    const cleanupCover = async () => {
      if (coverTmpPath) {
        const p = coverTmpPath;
        coverTmpPath = null;
        await fs.unlink(p).catch(() => {});
      }
    };

    try {
      const explicitStreamUrl = String(req.query.streamUrl || '').trim();
      let sourceUrl = explicitStreamUrl;
      let sourceIsHls = explicitStreamUrl.toLowerCase().includes('.m3u8');

      if (!sourceUrl) {
        const resolved = await resolveTrackPlayback({
          title,
          artist,
          durationSec: Number(req.query.duration || 0) || undefined,
          previewUrl: String(req.query.preview || '').trim() || undefined,
          soundcloudId: String(req.query.scId || '').trim() || undefined,
          audiusId: String(req.query.audiusId || '').trim() || undefined,
          youtubeVideoId: String(req.query.ytId || '').trim() || undefined,
          preferAudio: true,
        });
        sourceUrl = resolved.streamUrl || '';
        sourceIsHls = resolved.sourceType === 'audio-hls';
      }

      if (!sourceUrl) {
        res.status(404).json({ success: false, error: 'No direct audio stream available for MP3 export' });
        return;
      }

      const urlCheck = await validateSafeOutboundUrl(sourceUrl);
      if (!urlCheck.safe) {
        res.status(urlCheck.status).json({ success: false, error: urlCheck.reason });
        return;
      }
      const parsed = urlCheck.url;

      // Optional: fetch cover art + lyrics in parallel cleanly before spawning FFmpeg
      const [coverPathResult, lyricsPayload] = await Promise.all([
        (async () => {
          if (!coverUrl) return null;
          const covCheck = await validateSafeOutboundUrl(coverUrl);
          if (!covCheck.safe) return null;
          try {
            const { response: covRes } = await safeFetchFollowingRedirects(covCheck.url.toString(), {
              headers: { 'User-Agent': USER_AGENT },
              signal: AbortSignal.timeout(3500),
            });
            if (!covRes.ok) {
              void covRes.body?.cancel().catch(() => {});
              return null;
            }
            const ct = (covRes.headers.get('content-type') || '').toLowerCase();
            if (!ct.startsWith('image/jpeg') && !ct.startsWith('image/png') && !ct.startsWith('image/jpg')) {
              void covRes.body?.cancel().catch(() => {});
              return null;
            }
            const buf = Buffer.from(await covRes.arrayBuffer());
            if (buf.length === 0 || buf.length > 3 * 1024 * 1024) return null;
            const ext = ct.includes('png') ? 'png' : 'jpg';
            const tmpFile = path.join(
              os.tmpdir(),
              `riffan-cov-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
            );
            await fs.writeFile(tmpFile, buf);
            return tmpFile;
          } catch {
            return null;
          }
        })(),
        withLyrics ? getTrackLyrics({ artist, title, album: albumName }).catch(() => null) : Promise.resolve(null),
      ]);
      coverTmpPath = coverPathResult;

      // Build unified Studio Pro DSP filter chain matching WebAudio node graph
      const filters: string[] = [];

      if (mode === 'slowed') {
        filters.push(
          'aresample=44100',
          'asetrate=44100*0.85',
          'aresample=44100',
          'aecho=0.8:0.88:42:0.38',
          'lowshelf=f=100:g=3.5'
        );
      } else if (mode === 'nightcore') {
        filters.push('aresample=44100', 'asetrate=44100*1.22', 'aresample=44100', 'treble=g=2.5');
      } else {
        if (Math.abs(pitchSemitones) >= 0.25) {
          const factor = Math.pow(2, pitchSemitones / 12);
          const compTempo = rate / factor;
          filters.push(
            'aresample=44100',
            `asetrate=44100*${factor.toFixed(4)}`,
            'aresample=44100'
          );
          if (Math.abs(compTempo - 1) > 0.02) {
            const clampedTempo = Math.min(2.0, Math.max(0.5, compTempo));
            filters.push(`atempo=${clampedTempo.toFixed(3)}`);
          }
        } else if (Math.abs(rate - 1) > 0.02) {
          filters.push(`atempo=${rate.toFixed(3)}`);
        }
        if (bassDb > 0.5) {
          filters.push(`lowshelf=f=85:g=${bassDb.toFixed(1)}`);
        }
        if (reverbMix > 0.04) {
          filters.push(`aecho=0.8:0.88:32:${Math.min(0.65, reverbMix).toFixed(2)}`);
        }
      }

      if (mode === '8d') {
        const hz = (1 / speed8dSec).toFixed(3);
        const pulsatorMode =
          trajectory === 'pendulum'
            ? 'triangle'
            : trajectory === 'figure8'
            ? 'sine'
            : 'sine';
        filters.push(
          `apulsator=mode=${pulsatorMode}:hz=${hz}:width=0.9`,
          'aecho=0.8:0.88:28:0.32',
          'lowshelf=f=110:g=3'
        );
      }

      if (vocalCancel) {
        filters.push('stereotools=mlev=0.15:slev=1.15:softclip=1');
      }
      if (exciterMix > 0.05) {
        filters.push(`treble=g=${(exciterMix * 4.5).toFixed(1)}:f=6500`);
      }

      for (let i = 0; i < eqGains.length; i++) {
        const g = eqGains[i];
        if (Math.abs(g) >= 0.4) {
          filters.push(`equalizer=f=${EQ_10_FREQS[i]}:t=q:w=1.4:g=${g.toFixed(1)}`);
        }
      }

      if (fadeSec > 0 && trimStart >= 0) {
        filters.push(`afade=t=in:st=${trimStart.toFixed(2)}:d=${fadeSec.toFixed(2)}`);
        if (trimEnd > trimStart + fadeSec + 1) {
          filters.push(`afade=t=out:st=${(trimEnd - fadeSec).toFixed(2)}:d=${fadeSec.toFixed(2)}`);
        }
      }

      const suffix =
        mode === '8d'
          ? ' (8D Audio)'
          : mode === 'slowed'
          ? ' (Slowed + Reverb)'
          : mode === 'nightcore'
          ? ' (Nightcore)'
          : '';
      const rawName = `${artist} - ${title}${suffix}`
        .replace(/[\\/:*?"<>|]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120);
      const asciiFallback = rawName.replace(/[^\x20-\x7E]/g, '') || 'riffan-music-track';
      const utf8Encoded = encodeURIComponent(`${rawName || 'riffan-music-track'}.mp3`);

      const isHlsSource = sourceIsHls || parsed.pathname.toLowerCase().endsWith('.m3u8');
      const hlsSegmentUrls: string[] = [];
      const hlsController = new AbortController();

      if (isHlsSource) {
        let playlistText = '';
        let playlistBase = parsed.toString();
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const { response: m3Res, finalUrl } = await safeFetchFollowingRedirects(
              parsed.toString(),
              {
                headers: { 'User-Agent': USER_AGENT },
                signal: AbortSignal.any([hlsController.signal, AbortSignal.timeout(9000)]),
              }
            );
            if (m3Res.ok) {
              playlistText = await m3Res.text();
              playlistBase = finalUrl || parsed.toString();
              break;
            }
            void m3Res.body?.cancel().catch(() => {});
          } catch {
            if (hlsController.signal.aborted) break;
          }
        }
        if (!playlistText || !playlistText.includes('#EXTM3U')) {
          await cleanupCover();
          res.status(502).json({ success: false, error: 'Failed to load HLS playlist for MP3 export' });
          return;
        }

        const candidateUrls: string[] = [];
        const mapMatch = playlistText.match(/#EXT-X-MAP:URI="([^"]+)"/i);
        if (mapMatch?.[1]) {
          candidateUrls.push(new URL(mapMatch[1], playlistBase).toString());
        }
        for (const rawLine of playlistText.split(/\r?\n/)) {
          const trimmed = rawLine.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          candidateUrls.push(new URL(trimmed, playlistBase).toString());
        }

        for (const segUrlStr of candidateUrls) {
          const segCheck = await validateSafeOutboundUrl(segUrlStr);
          if (!segCheck.safe) {
            await cleanupCover();
            res.status(segCheck.status).json({ success: false, error: 'Forbidden HLS segment URL' });
            return;
          }
          hlsSegmentUrls.push(segCheck.url.toString());
        }

        if (hlsSegmentUrls.length === 0) {
          await cleanupCover();
          res.status(502).json({ success: false, error: 'Empty HLS playlist for MP3 export' });
          return;
        }
      }

      const ffBin = resolveFfmpegBin();
      const ffArgs: string[] = ['-hide_banner', '-loglevel', 'error'];

      if (trimStart > 0 && !isHlsSource) {
        ffArgs.push('-ss', trimStart.toFixed(2));
      }
      if (isHlsSource) {
        ffArgs.push('-i', 'pipe:0');
      } else {
        ffArgs.push('-user_agent', USER_AGENT, '-i', parsed.toString());
      }
      if (coverTmpPath) {
        ffArgs.push('-i', coverTmpPath);
      }
      if (trimEnd > trimStart && trimEnd - trimStart > 2) {
        ffArgs.push('-t', (trimEnd - trimStart).toFixed(2));
      }

      if (coverTmpPath) {
        ffArgs.push('-map', '0:a', '-map', '1:v', '-c:v', 'copy', '-disposition:v', 'attached_pic');
      } else {
        ffArgs.push('-vn');
      }

      if (filters.length > 0) {
        ffArgs.push('-af', filters.join(','));
      }

      ffArgs.push(
        '-c:a',
        'libmp3lame',
        '-b:a',
        bitrate,
        '-ar',
        '44100',
        '-id3v2_version',
        '3',
        '-metadata',
        `title=${title}${suffix}`,
        '-metadata',
        `artist=${artist}`,
        '-metadata',
        `album=${albumName}`
      );
      if (lyricsPayload?.plainLyrics) {
        ffArgs.push('-metadata', `lyrics=${lyricsPayload.plainLyrics.slice(0, 6000)}`);
      }
      ffArgs.push('-f', 'mp3', 'pipe:1');

      activeFfmpegJobs++;
      let slotReleased = false;
      const releaseSlot = () => {
        if (!slotReleased) {
          slotReleased = true;
          activeFfmpegJobs = Math.max(0, activeFfmpegJobs - 1);
        }
      };

      const ff = spawn(ffBin, ffArgs, {
        stdio: [isHlsSource ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      });
      let killed = false;
      let startedStreaming = false;
      const errChunks: Buffer[] = [];

      // Hard 90s timeout on ffmpeg jobs
      const jobTimeout = setTimeout(() => {
        if (!killed) {
          killed = true;
          hlsController.abort();
          try {
            ff.kill('SIGKILL');
          } catch {
            // ignore
          }
        }
      }, 90_000);

      ff.stderr?.on('data', (chunk: Buffer) => {
        if (errChunks.length < 8) errChunks.push(chunk);
      });

      if (isHlsSource && ff.stdin) {
        ff.stdin.on('error', () => {
          // ignore EPIPE
        });
        void (async () => {
          try {
            for (const segUrl of hlsSegmentUrls) {
              if (killed || hlsController.signal.aborted || ff.stdin?.destroyed) break;
              let segBuf: Buffer | null = null;
              for (let attempt = 0; attempt < 2; attempt++) {
                try {
                  const { response: segRes } = await safeFetchFollowingRedirects(segUrl, {
                    headers: { 'User-Agent': USER_AGENT },
                    signal: AbortSignal.any([hlsController.signal, AbortSignal.timeout(10000)]),
                  });
                  if (segRes.ok) {
                    segBuf = Buffer.from(await segRes.arrayBuffer());
                    break;
                  }
                  void segRes.body?.cancel().catch(() => {});
                } catch {
                  if (killed || hlsController.signal.aborted) break;
                }
              }
              if (!segBuf || segBuf.length === 0 || killed || ff.stdin?.destroyed) continue;
              const ok = ff.stdin!.write(segBuf);
              if (!ok && !killed && !ff.stdin?.destroyed) {
                await new Promise<void>((resolve) => {
                  ff.stdin?.once('drain', resolve);
                  ff.once('close', resolve);
                });
              }
            }
          } finally {
            try {
              if (ff.stdin && !ff.stdin.destroyed && !ff.stdin.writableEnded) {
                ff.stdin.end();
              }
            } catch {
              // ignore
            }
          }
        })();
      }

      res.on('close', () => {
        if (!res.writableEnded && !killed) {
          killed = true;
          hlsController.abort();
          try {
            ff.kill('SIGKILL');
          } catch {
            // ignore
          }
        }
      });

      ff.stdout?.on('data', (chunk: Buffer) => {
        if (!startedStreaming) {
          startedStreaming = true;
          res.setHeader('Content-Type', 'audio/mpeg');
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="${asciiFallback}.mp3"; filename*=UTF-8''${utf8Encoded}`
          );
          res.setHeader('Cache-Control', 'no-store');
          res.setHeader('X-Content-Type-Options', 'nosniff');
        }
        if (!res.writableEnded) {
          res.write(chunk);
        }
      });

      ff.stdout?.on('end', () => {
        if (startedStreaming && !res.writableEnded) {
          res.end();
        }
      });

      ff.on('error', () => {
        clearTimeout(jobTimeout);
        releaseSlot();
        hlsController.abort();
        void cleanupCover();
        if (!res.headersSent) {
          res.status(502).json({ success: false, error: 'MP3 encoder failed' });
        } else if (!res.writableEnded) {
          res.end();
        }
      });

      ff.on('close', (code) => {
        clearTimeout(jobTimeout);
        releaseSlot();
        hlsController.abort();
        void cleanupCover();
        if (!startedStreaming && !res.headersSent) {
          const detail = Buffer.concat(errChunks).toString('utf8').trim();
          res.status(502).json({
            success: false,
            error: detail || `MP3 transcode failed (${code ?? 'signal'})`,
          });
        } else if (!res.writableEnded) {
          res.end();
        }
      });
    } catch {
      await cleanupCover();
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'MP3 download failed' });
      }
    }
  });
}
