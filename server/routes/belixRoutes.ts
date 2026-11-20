import type { Express } from 'express';
import { parseBelixInventory } from '../services/belix/belixParser.ts';
import {
  decodeBelixInput,
  getBelixLiveOverview,
  inspectXtreamServer,
  probeBelixUrl,
} from '../services/belixService.ts';

export function registerBelixRoutes(app: Express): void {
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

  // Live RiffanTV sports, 24/7 channels & TDT + Xtream blueprint endpoints
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
