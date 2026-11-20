import type express from 'express';
import {
  parseClipboxInventory,
  type ClipboxCategoryId,
} from '../services/clipbox/clipboxParser.ts';
import {
  decodeClipboxInput,
  probeClipboxUrl,
  resolveClipboxTitleStreams,
  searchClipboxCatalog,
} from '../services/clipboxService.ts';

const VALID_CATEGORIES = new Set<ClipboxCategoryId>([
  'core',
  'decoding',
  'cinema_es',
  'cinema_intl',
  'anime',
  'extractors',
  'subtitles',
  'sdk',
]);

export function registerClipboxRoutes(app: express.Express): void {
  // Full parsed + decoded ClipBox inventory
  app.get('/api/clipbox/inventory', (req, res) => {
    const inv = parseClipboxInventory();
    const categoryParam = String(req.query.category || 'all').trim();
    const includeSdk = String(req.query.includeSdk || '0') === '1';
    const q = String(req.query.q || '').trim().toLowerCase();

    const filteredHosts = inv.hosts.filter((h) => {
      if (!includeSdk && categoryParam === 'all' && h.isBoilerplate) return false;
      if (categoryParam !== 'all' && VALID_CATEGORIES.has(categoryParam as ClipboxCategoryId)) {
        if (h.category !== categoryParam) return false;
      }
      if (q) {
        const matches =
          h.host.toLowerCase().includes(q) ||
          h.role.toLowerCase().includes(q) ||
          h.language.toLowerCase().includes(q) ||
          (h.decodedNote || '').toLowerCase().includes(q) ||
          h.urls.some((u) => u.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    });

    const filteredRoutes = q
      ? inv.routePatterns.filter(
          (r) =>
            r.pattern.toLowerCase().includes(q) ||
            (r.decodedName || '').toLowerCase().includes(q)
        )
      : inv.routePatterns;

    res.json({
      success: true,
      sourceFile: inv.sourceFile,
      declaredSummary: inv.declaredSummary,
      actualCounts: inv.actualCounts,
      categoryCounts: inv.categoryCounts,
      hosts: filteredHosts,
      decodedTokens: inv.decodedTokens,
      routePatterns: filteredRoutes.slice(0, 600),
      totalFilteredRoutes: filteredRoutes.length,
      decodedProviders: inv.decodedProviders,
      decodedExtractors: inv.decodedExtractors,
      mediaRefs: inv.mediaRefs,
    });
  });

  // Live search across ClipBox engines (TMDB + Kitsu Anime)
  app.get('/api/clipbox/search', async (req, res) => {
    const q = String(req.query.q || '').trim();
    const scopeRaw = String(req.query.scope || 'all').toLowerCase();
    const scope =
      scopeRaw === 'anime' || scopeRaw === 'cinema' ? scopeRaw : 'all';

    try {
      const items = await searchClipboxCatalog(q, scope);
      res.json({
        success: true,
        query: q,
        scope,
        items,
      });
    } catch {
      res.status(502).json({
        success: false,
        items: [],
        error: 'Error al consultar los motores ClipBox.',
      });
    }
  });

  // Build ready-to-play ClipBox multi-provider streams + subtitles + AniSkip/TheIntroDB timestamps
  app.get('/api/clipbox/title-streams', async (req, res) => {
    const title = String(req.query.title || '').trim();
    if (!title) {
      return res.status(400).json({ success: false, error: 'Falta el título' });
    }
    const mediaTypeRaw = String(req.query.mediaType || 'movie').toLowerCase();
    const mediaType: 'movie' | 'tv' | 'anime' =
      mediaTypeRaw === 'tv' || mediaTypeRaw === 'anime' ? mediaTypeRaw : 'movie';
    const tmdbIdNum = Number(String(req.query.tmdbId || '').replace(/\D/g, '')) || undefined;
    const kitsuId = String(req.query.kitsuId || '').trim() || undefined;
    const season = Math.max(1, Number(req.query.season || 1) || 1);
    const episode = Math.max(1, Number(req.query.episode || 1) || 1);

    try {
      const data = await resolveClipboxTitleStreams({
        title,
        mediaType,
        tmdbId: tmdbIdNum,
        kitsuId,
        season,
        episode,
      });
      res.json({ success: true, ...data });
    } catch {
      res.status(502).json({
        success: false,
        error: 'No se pudieron generar los servidores ClipBox.',
      });
    }
  });

  // Single SSRF-safe live host probe
  app.get('/api/clipbox/probe', async (req, res) => {
    const host = String(req.query.host || '').trim();
    const url = String(req.query.url || '').trim();
    const result = await probeClipboxUrl({ host, url });
    res.json({ success: true, probe: result });
  });

  // Batched SSRF-safe live probe (max 12 hosts per call)
  app.post('/api/clipbox/probe-batch', async (req, res) => {
    const hostsRaw = Array.isArray(req.body?.hosts) ? req.body.hosts : [];
    const hosts = hostsRaw
      .map((h: unknown) => String(h || '').trim())
      .filter(Boolean)
      .slice(0, 12);
    if (hosts.length === 0) {
      return res.status(400).json({ success: false, error: 'Lista de hosts vacía' });
    }

    const results = await Promise.all(
      hosts.map((host: string) => probeClipboxUrl({ host }))
    );
    res.json({ success: true, probes: results });
  });

  // Live Base64 / URL / Extractor / Keys decoder
  app.post('/api/clipbox/decode', async (req, res) => {
    const input = String(req.body?.input || '').trim();
    const fetchLiveSample = Boolean(req.body?.fetchLiveSample);
    if (!input || input.length > 4096) {
      return res.status(400).json({
        success: false,
        error: 'Introduce una URL, token o patrón válido (máx. 4096 caracteres).',
      });
    }
    const decoded = await decodeClipboxInput(input, fetchLiveSample);
    res.json({ success: true, decoded });
  });
}
