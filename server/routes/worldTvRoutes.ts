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
import {
  channelHealthMonitor,
  MAX_CHANNEL_PROBE_CONCURRENCY,
  type HealthProbeChannel,
  type HealthProbeTrack,
} from '../services/channelHealthMonitor.ts';
import { STATUS_RANK } from '../services/channelHealthProbe.ts';
import { getBelixLiveChannels } from '../services/belix/belixXtreamClient.ts';
import { getCuratedRbtvChannels } from '../services/rbtv/rbtvLiveCurator.ts';

export function registerWorldTvRoutes(app: Express): void {
  app.get('/api/catalog/world-tv', async (req, res) => {
    const force = req.query.refresh === '1';
    const includeDown = req.query.includeDown === '1';
    const countryFilter = String(req.query.country || '').trim().toLowerCase();
    const categoryFilter = String(req.query.category || '').trim().toLowerCase();
    const hubFilter = String(req.query.hub || '').trim().toLowerCase();

    let worldChannels = getCachedFamelackWorldChannels();
    if (force || worldChannels.length === 0) {
      worldChannels = await refreshFamelackAndWorldCatalog(force).catch(() => worldChannels);
    } else {
      void refreshFamelackAndWorldCatalog(false).catch(() => undefined);
    }

    if (worldChannels.length > 0 && !channelHealthMonitor.getSummary().isSweeping) {
      const hasAnyProbedWorld = worldChannels.some((ch) =>
        (ch.channels || []).some((tr) => {
          const st = channelHealthMonitor.getTrackHealth(tr.sourceUrl)?.status;
          return st !== undefined && st !== 'unknown';
        })
      );
      if (!hasAnyProbedWorld) {
        void channelHealthMonitor
          .runSweep(worldChannels, {
            concurrency: MAX_CHANNEL_PROBE_CONCURRENCY,
            timeoutMs: 1_500,
          })
          .catch(() => {});
      }
    }

    let filtered: Array<HealthProbeChannel<HealthProbeTrack> & Record<string, any>> = [
      ...worldChannels,
      ...getBelixLiveChannels({ includeAll: true }),
      ...getCuratedRbtvChannels(),
    ];
    if (countryFilter) {
      filtered = filtered.filter((c) => (c.countryCode || '').toLowerCase() === countryFilter);
    }
    if (categoryFilter) {
      filtered = filtered.filter((c) => (c.category || '').toLowerCase() === categoryFilter);
    }
    if (hubFilter) {
      filtered = filtered.filter((c) => (c.sourceHub || '').toLowerCase() === hubFilter);
    }

    const prioritizedRaw = channelHealthMonitor.prioritizeChannels(filtered).map((ch) => {
      const nonDownTracks = (ch.channels || []).filter(
        (tr) => (tr.health?.status ?? 'unknown') !== 'down'
      );
      return {
        ...ch,
        channels: nonDownTracks.length > 0 ? nonDownTracks : ch.channels,
        logoUrl: ch.logoUrl || resolveOfficialChannelLogoUrl(ch) || undefined,
      };
    });

    const upCount = prioritizedRaw.filter(
      (ch) => (ch.healthSummary?.bestStatus ?? 'unknown') === 'up'
    ).length;
    const includeUnknown = req.query.includeUnknown === '1';
    const hasNonDownChannels = prioritizedRaw.some(
      (ch) => (ch.healthSummary?.bestStatus ?? 'unknown') !== 'down'
    );
    const visibleChannels =
      includeDown || !hasNonDownChannels
        ? prioritizedRaw
        : prioritizedRaw.filter((ch) => {
            const st = ch.healthSummary?.bestStatus ?? 'unknown';
            if (st === 'down') return false;
            if (!includeUnknown && upCount >= 50 && st === 'unknown') return false;
            return true;
          });

    visibleChannels.sort((a, b) => {
      const rankA = STATUS_RANK[a.healthSummary?.bestStatus ?? 'unknown'];
      const rankB = STATUS_RANK[b.healthSummary?.bestStatus ?? 'unknown'];
      if (rankA !== rankB) return rankA - rankB;
      const latA = a.healthSummary?.bestLatencyMs ?? Number.MAX_SAFE_INTEGER;
      const latB = b.healthSummary?.bestLatencyMs ?? Number.MAX_SAFE_INTEGER;
      return latA - latB;
    });

    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json({
      success: true,
      meta: getFamelackWorldMeta(),
      channels: visibleChannels,
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
