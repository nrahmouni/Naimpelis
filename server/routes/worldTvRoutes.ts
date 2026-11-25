/**
 * @module server/routes/worldTvRoutes
 * @description REST API routes for Famelack World TV, Free-TV/IPTV, iptv-org Sports,
 * ADRAR Europe country packs, and Elahmad live directory endpoints.
 */
import type { Express } from 'express';
import { resolveOfficialChannelLogoUrl } from '../../src/shared/channelLogos.ts';
import {
  getCachedFamelackWorldChannels,
  getFamelackWorldMeta,
  refreshFamelackAndWorldCatalog,
} from '../services/famelackIptvService.ts';
import { fetchElahmadCategoryDirectory } from '../extractors/elahmadExtractor.ts';
import { channelHealthMonitor } from '../services/channelHealthMonitor.ts';
import { getBelixLiveChannels } from '../services/belix/belixXtreamClient.ts';
import { getCuratedRbtvChannels } from '../services/rbtv/rbtvLiveCurator.ts';

export function registerWorldTvRoutes(app: Express): void {
  app.get('/api/catalog/world-tv', async (req, res) => {
    const force = req.query.refresh === '1';
    const countryFilter = String(req.query.country || '').trim().toLowerCase();
    const categoryFilter = String(req.query.category || '').trim().toLowerCase();
    const hubFilter = String(req.query.hub || '').trim().toLowerCase();

    let worldChannels = getCachedFamelackWorldChannels();
    if (force || worldChannels.length === 0) {
      worldChannels = await refreshFamelackAndWorldCatalog(force).catch(() => worldChannels);
    } else {
      void refreshFamelackAndWorldCatalog(false).catch(() => undefined);
    }

    let filtered = [...worldChannels, ...getBelixLiveChannels({ includeAll: true }), ...getCuratedRbtvChannels()];
    if (countryFilter) {
      filtered = filtered.filter((c) => (c.countryCode || '').toLowerCase() === countryFilter);
    }
    if (categoryFilter) {
      filtered = filtered.filter((c) => (c.category || '').toLowerCase() === categoryFilter);
    }
    if (hubFilter) {
      filtered = filtered.filter((c) => (c.sourceHub || '').toLowerCase() === hubFilter);
    }

    const prioritized = channelHealthMonitor.prioritizeChannels(filtered).map((ch) => ({
      ...ch,
      logoUrl: resolveOfficialChannelLogoUrl(ch) || ch.logoUrl || undefined,
    }));

    res.setHeader('Cache-Control', 'public, max-age=180');
    res.json({
      success: true,
      meta: getFamelackWorldMeta(),
      channels: prioritized,
    });
  });

  app.get('/api/catalog/elahmad', async (req, res) => {
    const category = String(req.query.category || 'morocco').trim().toLowerCase();
    const entries = await fetchElahmadCategoryDirectory(category);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({
      success: true,
      category,
      total: entries.length,
      channels: entries.map((e, idx) => ({
        id: e.id,
        dial: 700 + idx,
        name: e.name,
        shortMark: e.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 5).toUpperCase() || 'ELAH',
        brandTone: '#047857',
        network: `Elahmad · ${e.category}`,
        category: 'elahmad_mena',
        sourceHub: 'elahmad',
        quality: 'HD Live',
        description: `${e.name} · Elahmad Live TV`,
        channels: [
          {
            id: `${e.id}-live`,
            label: `Elahmad Live (${e.name})`,
            lang: 'AR',
            quality: 'HD',
            sourceUrl: e.pageUrl,
            resolverType: 'elahmad_live',
          },
        ],
      })),
    });
  });
}
