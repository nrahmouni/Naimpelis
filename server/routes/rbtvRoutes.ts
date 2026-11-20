import type { Express } from 'express';
import { parseRbtvInventory } from '../services/rbtv/rbtvParser.ts';
import {
  decodeRbtvInput,
  getRbtvLiveOverview,
  probeRbtvUrl,
  resolveDomainViaDoh,
} from '../services/rbtvService.ts';

export function registerRbtvRoutes(app: Express): void {
  // Full parsed inventory from public/assets/aistudio/rutas_RBTV_c34416da.txt
  app.get('/api/rbtv/inventory', (req, res) => {
    const category = String(req.query.category || '').trim();
    const q = String(req.query.q || '').trim().toLowerCase();
    const inv = parseRbtvInventory();

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
          h.urlItems.some((u) => u.references.some((r) => r.toLowerCase().includes(q)))
      );
    }

    res.json({
      success: true,
      sourceFile: inv.sourceFile,
      archiveName: inv.archiveName,
      declaredSummary: inv.declaredSummary,
      actualCounts: inv.actualCounts,
      categoryCounts: inv.categoryCounts,
      hosts: filteredHosts,
      pathsByHost: inv.pathsByHost,
      mediaFormats: inv.mediaFormats,
      primaryDomains: inv.primaryDomains,
      architectureNodes: inv.architectureNodes,
    });
  });

  // Live RBTV+ core cluster status + RiffanTV direct sports & 24/7 channels
  app.get('/api/rbtv/live-overview', async (_req, res) => {
    try {
      const overview = await getRbtvLiveOverview();
      res.json({ success: true, ...overview });
    } catch {
      res.status(502).json({
        success: false,
        error: 'No se pudo consultar el estado en vivo de RBTV+.',
      });
    }
  });

  // Single SSRF-safe live HTTP probe for RBTV+ hosts
  app.get('/api/rbtv/probe', async (req, res) => {
    const host = String(req.query.host || '').trim();
    const url = String(req.query.url || '').trim();
    const probe = await probeRbtvUrl({ host, url });
    res.json({ success: true, probe });
  });

  // Batched SSRF-safe live probe (max 12 hosts per call)
  app.post('/api/rbtv/probe-batch', async (req, res) => {
    const raw = Array.isArray(req.body?.hosts) ? req.body.hosts : [];
    const hosts = raw
      .map((h: unknown) => String(h || '').trim())
      .filter(Boolean)
      .slice(0, 12);
    if (hosts.length === 0) {
      return res.status(400).json({ success: false, error: 'Lista de hosts vacía' });
    }
    const probes = await Promise.all(hosts.map((host: string) => probeRbtvUrl({ host })));
    res.json({ success: true, probes });
  });

  // Live DoH lookup (Cloudflare / Google) for allowed RBTV+ domains
  app.get('/api/rbtv/doh-resolve', async (req, res) => {
    const domain = String(req.query.domain || '').trim();
    const provider = req.query.provider === 'google' ? 'google' : 'cloudflare';
    if (!domain) {
      return res.status(400).json({ success: false, error: 'Dominio requerido' });
    }
    const resolution = await resolveDomainViaDoh(domain, provider);
    res.json({ success: true, resolution });
  });

  // Decode URL / Smali component / DoH / endpoint
  app.post('/api/rbtv/decode', async (req, res) => {
    const input = String(req.body?.input || '').trim();
    const fetchLiveSample = Boolean(req.body?.fetchLiveSample);
    const runDoh = Boolean(req.body?.runDoh);
    if (!input || input.length > 4096) {
      return res.status(400).json({
        success: false,
        error: 'Introduce una URL, dominio o referencia válida (máx. 4096 caracteres).',
      });
    }
    const decoded = await decodeRbtvInput(input, { fetchLiveSample, runDoh });
    res.json({ success: true, decoded });
  });
}
