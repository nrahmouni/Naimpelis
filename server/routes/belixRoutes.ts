import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import { parseBelixInventory } from '../services/belix/belixParser.ts';
import {
  connectBelixSession,
  disconnectBelixSession,
  fetchBelixOpaqueSegment,
  getBelixLiveChannels,
  getBelixStatus,
  refreshBelixChannels,
  resolveBelixManifest,
  resolveBelixSubPlaylist,
} from '../services/belix/belixXtreamClient.ts';
import {
  decodeBelixInput,
  getBelixLiveOverview,
  inspectXtreamServer,
  probeBelixUrl,
} from '../services/belixService.ts';

function readCookieValue(req: Request, name: string): string {
  const raw = String(req.headers.cookie || '');
  if (!raw) return '';
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return '';
}

function getBelixSessionKey(req: Request, res?: Response): string {
  const headerKey = String(req.headers['x-belix-session'] || '').trim();
  if (/^[a-zA-Z0-9_-]{8,64}$/.test(headerKey)) return headerKey;
  const cookieKey = readCookieValue(req, 'belix_sid');
  if (/^[a-zA-Z0-9_-]{8,64}$/.test(cookieKey)) return cookieKey;
  if (res) {
    const newKey = crypto.randomBytes(16).toString('hex');
    res.setHeader(
      'Set-Cookie',
      `belix_sid=${newKey}; Path=/api/belix; HttpOnly; SameSite=Lax; Max-Age=21600`
    );
    return newKey;
  }
  return 'default';
}

function resolveBelixOriginPrefix(
  req: Request,
  getPublicOrigin?: (req: Request) => string
): string {
  if (req.query.abs !== '1') return '';
  if (getPublicOrigin) return getPublicOrigin(req);
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.get('host') || '').split(',')[0].trim();
  return host ? `${proto}://${host}` : '';
}

export function registerBelixRoutes(
  app: Express,
  deps?: { getPublicOrigin?: (req: Request) => string }
): void {
  // Belix Xtream live session status (never exposes credentials)
  app.get('/api/belix/status', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const sessionKey = getBelixSessionKey(req);
    res.json({ success: true, status: getBelixStatus(sessionKey) });
  });

  // Connect runtime Xtream session in RAM only
  app.post('/api/belix/connect', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const sessionKey = getBelixSessionKey(req, res);
    const serverUrl = String(req.body?.serverUrl || '').trim();
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '').trim();
    const status = await connectBelixSession({ serverUrl, username, password, sessionKey });
    const channels = status.connected ? getBelixLiveChannels({ includeAll: true, sessionKey }) : [];
    res.status(status.connected ? 200 : 400).json({
      success: status.connected,
      status,
      channels,
    });
  });

  app.post('/api/belix/disconnect', (req, res) => {
    const sessionKey = getBelixSessionKey(req);
    disconnectBelixSession(sessionKey);
    res.json({ success: true, status: getBelixStatus(sessionKey) });
  });

  app.post('/api/belix/refresh', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const sessionKey = getBelixSessionKey(req);
    const status = await refreshBelixChannels(sessionKey);
    res.json({
      success: status.connected,
      status,
      channels: status.connected ? getBelixLiveChannels({ includeAll: true, sessionKey }) : [],
    });
  });

  app.get('/api/belix/channels', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const sessionKey = getBelixSessionKey(req);
    const categoryId = String(req.query.categoryId || '').trim();
    const query = String(req.query.q || '').trim();
    const includeAll = req.query.includeAll === '1' || req.query.includeAll === 'true';
    const status = getBelixStatus(sessionKey);
    const channels = getBelixLiveChannels({ categoryId, query, includeAll, sessionKey });
    res.json({
      success: true,
      status,
      channels,
    });
  });

  // Credential-free Belix HLS master/media manifest proxy
  app.all('/api/belix/stream/:streamId', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    if (req.method === 'OPTIONS') return res.status(204).end();
    const streamId = String(req.params.streamId || '').replace(/\.m3u8$/i, '');
    const originPrefix = resolveBelixOriginPrefix(req, deps?.getPublicOrigin);
    const sessionKey = getBelixSessionKey(req);
    const manifest = await resolveBelixManifest(streamId, originPrefix, sessionKey);
    if (!manifest) {
      return res.status(503).send('Belix live stream unavailable');
    }
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    if (req.method === 'HEAD') return res.status(200).end();
    return res.send(manifest);
  });

  app.all('/api/belix/sub/:token', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    if (req.method === 'OPTIONS') return res.status(204).end();
    const originPrefix = resolveBelixOriginPrefix(req, deps?.getPublicOrigin);
    const manifest = await resolveBelixSubPlaylist(String(req.params.token || ''), originPrefix);
    if (!manifest) return res.status(404).send('Playlist token expired');
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    if (req.method === 'HEAD') return res.status(200).end();
    return res.send(manifest);
  });

  app.all('/api/belix/seg/:token', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') return res.status(204).end();
    const seg = await fetchBelixOpaqueSegment(
      String(req.params.token || ''),
      typeof req.headers.range === 'string' ? req.headers.range : undefined
    );
    if (!seg) return res.status(502).send('Segment unavailable');
    res.status(seg.status);
    res.setHeader('Content-Type', seg.contentType);
    res.setHeader('Content-Length', String(seg.buffer.length));
    if (req.method === 'HEAD') return res.end();
    return res.end(seg.buffer);
  });

  // Full parsed inventory from rutas_Belix_TV_6fb3f038.txt
  app.get('/api/belix/inventory', (req, res) => {
    const category = String(req.query.category || '').trim();
    const q = String(req.query.q || '').trim().toLowerCase();
    const inv = parseBelixInventory();

    let filteredHosts = inv.hosts;
    if (category && category !== 'all') {
      filteredHosts = filteredHosts.filter((h) => h.category === category);
    }
    if (q) {
      filteredHosts = filteredHosts.filter(
        (h) =>
          h.host.toLowerCase().includes(q) ||
          h.role.toLowerCase().includes(q) ||
          h.urls.some((u) => u.toLowerCase().includes(q)) ||
          h.origins.some((o) => o.toLowerCase().includes(q))
      );
    }

    res.json({
      success: true,
      sourceFile: inv.sourceFile,
      archiveName: inv.archiveName,
      packageName: inv.packageName,
      originalPackages: inv.originalPackages,
      reverseEngineeringUpdate: inv.reverseEngineeringUpdate,
      declaredSummary: inv.declaredSummary,
      actualCounts: inv.actualCounts,
      categoryCounts: inv.categoryCounts,
      apiEndpoints: inv.apiEndpoints,
      apiParams: inv.apiParams,
      dynamicRoutes: inv.dynamicRoutes,
      streamingNotes: inv.streamingNotes,
      appExternalUrls: inv.appExternalUrls,
      hosts: filteredHosts,
      codeFiles: inv.codeFiles,
      limitations: inv.limitations,
    });
  });

  // Live Belix Xtream channels + curated sports, 24/7 channels & TDT
  app.get('/api/belix/live-overview', (_req, res) => {
    const overview = getBelixLiveOverview();
    res.json({ success: true, ...overview });
  });

  // Single SSRF-safe live HTTP probe for allowlisted Belix TV hosts
  app.get('/api/belix/probe', async (req, res) => {
    const host = String(req.query.host || '').trim();
    const url = String(req.query.url || '').trim();
    const probe = await probeBelixUrl({ host, url });
    res.json({ success: true, probe });
  });

  // Batched SSRF-safe live probe (max 10 hosts per call)
  app.post('/api/belix/probe-batch', async (req, res) => {
    const raw = Array.isArray(req.body?.hosts) ? req.body.hosts : [];
    const hosts = raw
      .map((h: unknown) => String(h || '').trim())
      .filter(Boolean)
      .slice(0, 10);
    if (hosts.length === 0) {
      return res.status(400).json({ success: false, error: 'Lista de hosts vacía' });
    }
    const probes = await Promise.all(hosts.map((host: string) => probeBelixUrl({ host })));
    res.json({ success: true, probes });
  });

  // Decode Xtream URL / relative endpoint / Smali class / Belix host
  app.post('/api/belix/decode', (req, res) => {
    const input = String(req.body?.input || '').trim();
    if (!input || input.length > 4096) {
      return res.status(400).json({
        success: false,
        error: 'Introduce una URL, ruta Xtream o clase Smali válida (máx. 4096 caracteres).',
      });
    }
    const decoded = decodeBelixInput(input);
    res.json({ success: true, decoded });
  });

  // Inspect user's own public Xtream Codes portal server-side (no credential persistence)
  app.post('/api/belix/xtream-inspect', async (req, res) => {
    const serverUrl = String(req.body?.serverUrl || '').trim();
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '').trim();
    if (!serverUrl || !username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Introduce URL del servidor, usuario y contraseña Xtream.',
      });
    }
    const inspection = await inspectXtreamServer({ serverUrl, username, password });
    res.json({ success: inspection.ok, inspection });
  });
}
