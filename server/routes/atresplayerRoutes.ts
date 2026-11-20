import type { Express } from 'express';
import { parseAtresplayerInventory } from '../services/atresplayer/atresplayerParser.ts';
import {
  decodeAtresplayerInput,
  getAtresplayerOverview,
  probeAtresplayerUrl,
} from '../services/atresplayerService.ts';

export function registerAtresplayerRoutes(app: Express): void {
  app.get('/api/atresplayer/inventory', (req, res) => {
    const category = String(req.query.category || '').trim();
    const serviceGroup = String(req.query.serviceGroup || '').trim();
    const q = String(req.query.q || '').trim().toLowerCase();
    const inv = parseAtresplayerInventory();

    let filteredHosts = inv.hosts;
    if (category && category !== 'all') {
      filteredHosts = filteredHosts.filter((h) => h.category === category);
    }
    if (q) {
      filteredHosts = filteredHosts.filter(
        (h) =>
          h.host.toLowerCase().includes(q) ||
          h.role.toLowerCase().includes(q) ||
          h.categoryLabel.toLowerCase().includes(q) ||
          h.basePaths.some((p) => p.toLowerCase().includes(q)) ||
          h.sampleUrls.some((u) => u.toLowerCase().includes(q))
      );
    }

    let filteredServices = inv.retrofitServices;
    if (serviceGroup && serviceGroup !== 'all') {
      filteredServices = filteredServices.filter((s) => s.group === serviceGroup);
    }
    if (q) {
      filteredServices = filteredServices.filter(
        (s) =>
          s.service.toLowerCase().includes(q) ||
          s.host.toLowerCase().includes(q) ||
          s.summary.toLowerCase().includes(q) ||
          s.highlightMethods.some((m) => m.toLowerCase().includes(q)) ||
          s.routePatterns.some((rp) => rp.toLowerCase().includes(q))
      );
    }

    let filteredUrls = inv.literalUrls;
    if (q) {
      filteredUrls = filteredUrls.filter(
        (u) =>
          u.url.toLowerCase().includes(q) ||
          u.host.toLowerCase().includes(q) ||
          u.category.toLowerCase().includes(q) ||
          u.note.toLowerCase().includes(q)
      );
    }

    res.json({
      success: true,
      sourceFile: inv.sourceFile,
      archiveName: inv.archiveName,
      documentDate: inv.documentDate,
      packageNames: inv.packageNames,
      zipEntries: inv.zipEntries,
      javaFiles: inv.javaFiles,
      declaredSummary: inv.declaredSummary,
      actualCounts: inv.actualCounts,
      categoryCounts: inv.categoryCounts,
      serviceGroupCounts: inv.serviceGroupCounts,
      portNotes: inv.portNotes,
      videoNotes: inv.videoNotes,
      hosts: filteredHosts,
      baseUrls: inv.baseUrls,
      playbackChain: inv.playbackChain,
      sourceFields: inv.sourceFields,
      mimeTypes: inv.mimeTypes,
      propertiesKeys: inv.propertiesKeys,
      retrofitServices: filteredServices,
      literalUrls: filteredUrls,
      limitations: inv.limitations,
    });
  });

  app.get('/api/atresplayer/overview', (_req, res) => {
    const overview = getAtresplayerOverview();
    res.json({ success: true, ...overview });
  });

  app.get('/api/atresplayer/probe', async (req, res) => {
    const host = String(req.query.host || '').trim();
    const url = String(req.query.url || '').trim();
    const probe = await probeAtresplayerUrl({ host, url });
    res.json({ success: true, probe });
  });

  app.post('/api/atresplayer/probe-batch', async (req, res) => {
    const raw = Array.isArray(req.body?.hosts) ? req.body.hosts : [];
    const hosts = raw
      .map((h: unknown) => String(h || '').trim())
      .filter(Boolean)
      .slice(0, 12);
    if (hosts.length === 0) {
      return res.status(400).json({ success: false, error: 'Lista de hosts vacía' });
    }
    const probes = await Promise.all(hosts.map((host: string) => probeAtresplayerUrl({ host })));
    res.json({ success: true, probes });
  });

  app.post('/api/atresplayer/decode', (req, res) => {
    const input = String(req.body?.input || '').trim();
    if (!input || input.length > 4096) {
      return res.status(400).json({
        success: false,
        error: 'Introduce una URL, ruta //client/v1/, servicio Retrofit o clave DRM válida.',
      });
    }
    const decoded = decodeAtresplayerInput(input);
    res.json({ success: true, decoded });
  });
}
