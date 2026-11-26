/**
 * @module server/routes/iptv
 * @description TDT catalog API + Smart TV IPTV suite (.m3u playlists, live HLS resolver, PNG channel badges, and XMLTV /epg.xml).
 */
import type { Express, Request, Response } from 'express';
import { resolveOfficialChannelLogoUrl } from '../../src/shared/channelLogos.ts';
import { logger } from '../utils/logger.ts';
import { LruTtlCache } from '../utils/lruCache.ts';
import {
  isDvbHeadendStream,
  maybeSignEasyBroadcastUrl,
  resolveKnownUpstreamReferer,
  type TrackRecord,
} from '../extractors/httpHelpers.ts';
import { extractLiveSportsHlsDirect, sniffStreamWithHeadless, verifyM3u8HasCleanVideoFrame } from '../extractors/sportsExtractor.ts';
import { isElahmadUrl, resolveElahmadChannelToHls } from '../extractors/elahmadExtractor.ts';
import { SPANISH_TDT_CHANNELS } from '../data/tdtChannels.ts';
import { INTERNATIONAL_TV_CHANNELS } from '../data/internationalChannels.ts';
import { resolveCanonicalChannelKey } from '../../src/utils/channelQualityRanker.ts';
import {
  applySyncedStreamsToChannels,
  getIptvSyncMeta,
  refreshLiveIptvRegistry,
} from '../services/iptvPlaylistService.ts';
import { channelHealthMonitor } from '../services/channelHealthMonitor.ts';
import { buildUnifiedPrioritizedChannels } from '../services/channelQualityMatcher.ts';
import { loadSpanishEpgSchedule } from '../services/epgService.ts';
import { resolveMediasetLiveHlsUrl } from '../services/mediasetLiveService.ts';
import { getAllIptvChannels, getIptvChannelById, invalidateIptvChannelCache } from './iptvHelpers/iptvChannelRegistry.ts';
import {
  getCachedFamelackWorldChannels,
  refreshFamelackAndWorldCatalog,
} from '../services/famelackIptvService.ts';
import {
  getBelixLiveChannels,
  isAnyBelixConnected,
  resolveBelixManifest,
} from '../services/belix/belixXtreamClient.ts';
import {
  fetchProxiedXtreamManifest,
  getCachedXtreamLiveTdtChannels,
  isXtreamEnvConfigured,
  syncFullCatalog as syncXtreamEnvCatalog,
} from '../services/xtreamService.ts';
import { getCuratedRbtvChannels } from '../services/rbtv/rbtvLiveCurator.ts';
import {
  getCachedSpainXtreamChannelsSync,
  getVerifiedSpainXtreamChannels,
} from '../services/octopusSpainLiveService.ts';
import { isProviderCircuitOpen } from '../services/providerCircuitBreaker.ts';
import { findXtreamLiveChannelMatches } from '../services/xtreamVodMatcher.ts';
import { getConnectedProvidersRuntimeCatalog } from '../services/providers/xtreamProvidersService.ts';
import {
  ensureLiveDvbCleanHlsSession,
  getActiveDvbSessionPath,
  readLiveDvbPlaylistForIptv,
} from './proxies/dvbTranscoder.ts';
import {
  IPTV_GROUP_TITLES,
  IPTV_MACRO_GROUP_LABELS,
  escapeXmlText,
  fetchUpstreamManifestText,
  formatXmltvUtcTime,
  getIptvEpgId,
  getIptvMacroGroup,
  renderIptvChannelPng,
  rewriteManifestForSamsungIptv,
  trimLiveDvrManifestForIptv,
  unwrapMasterPlaylistForIptv,
  verifyIptvMediaManifestSegments,
} from './iptvHelpers/iptvMediaHelpers.ts';

export function getLiveVoiceChannels() {
  const merged = applySyncedStreamsToChannels(SPANISH_TDT_CHANNELS);
  return buildUnifiedPrioritizedChannels(merged).map((ch) => ({
    ...ch,
    logoUrl: resolveOfficialChannelLogoUrl(ch) || undefined,
  }));
}

export function getUnifiedLiveTdtChannelsForBackground() {
  const baseTdtChannels = applySyncedStreamsToChannels(SPANISH_TDT_CHANNELS, isAnyBelixConnected('default'));
  const verifiedSpainChannels = getCachedSpainXtreamChannelsSync();
  const verifiedSpainIds = new Set(verifiedSpainChannels.map((c) => c.streamId));
  const xtreamEnvChannels = getCachedXtreamLiveTdtChannels().filter(
    (c) =>
      !verifiedSpainIds.has(c.streamId) &&
      (c.countryCode === 'ES' || c.category === 'movistar' || c.category === 'dazn')
  );
  return buildUnifiedPrioritizedChannels([
    ...verifiedSpainChannels,
    ...baseTdtChannels,
    ...xtreamEnvChannels,
  ]);
}

function curateHealthyAlternatives<T extends { channels?: Array<{ sourceUrl: string; providerId?: string; health?: { status?: string } }> }>(
  channels: T[]
): T[] {
  return channels.map((ch) => {
    const list = ch.channels || [];
    if (list.length <= 6) return ch;
    const healthy: typeof list = [];
    const recovering: typeof list = [];
    for (const tr of list) {
      if (tr.health?.status !== 'down' && !isProviderCircuitOpen(tr.sourceUrl, tr.providerId)) {
        healthy.push(tr);
      } else {
        recovering.push(tr);
      }
    }
    if (healthy.length >= 10) {
      return {
        ...ch,
        channels: healthy,
      };
    }
    if (healthy.length > 0 && recovering.length > 0) {
      return {
        ...ch,
        channels: [...healthy, ...recovering],
      };
    }
    return ch;
  });
}

const iptvChannelResolveCache = new LruTtlCache<
  string,
  {
    rawM3u8Url: string;
    referer: string;
    forceAac: boolean;
    isPublicCorsCdn: boolean;
    isDvb?: boolean;
    ts: number;
  }
>(150, 20 * 60 * 1000);

const epgXmlResponseCache = new LruTtlCache<string, string>(6, 5 * 60 * 1000);
const tdtCatalogJsonCache = new LruTtlCache<
  string,
  { success: true; iptvMeta: ReturnType<typeof getIptvSyncMeta>; channels: unknown[] }
>(4, 90_000);

async function resolveDvbIptvPlaylistText(
  cleanUrl: string,
  referer: string,
  publicOrigin: string
): Promise<string | null> {
  const sessionPath = await ensureLiveDvbCleanHlsSession(cleanUrl, 'hd', referer).catch(() => null);
  if (!sessionPath) return null;
  return readLiveDvbPlaylistForIptv(sessionPath, publicOrigin);
}

function sendIptvM3u8Response(res: Response, body: string): Response {
  const cleanBody = body.endsWith('\n') ? body : `${body}\n`;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Content-Length', String(Buffer.byteLength(cleanBody, 'utf8')));
  return res.send(cleanBody);
}



export function registerIptvAndTdtRoutes(
  app: Express,
  deps: { getPublicOrigin: (req: Request) => string }
): void {
  const { getPublicOrigin } = deps;

  app.get('/api/catalog/tdt', async (req, res) => {
    const forceRefresh = req.query.refresh === '1';
    const belixSidMatch = String(req.headers.cookie || '').match(/(?:^|;\s*)belix_sid=([^;]+)/);
    const belixSessionKey =
      String(req.headers['x-belix-session'] || '').trim() ||
      (belixSidMatch ? decodeURIComponent(belixSidMatch[1].trim()) : '') ||
      'default';
    const belixActive = isAnyBelixConnected(belixSessionKey);
    const priorityMode =
      String(req.query.priority || '').trim().toLowerCase() === 'best_quality'
        ? 'best_quality'
        : 'es_quality';
    const hasWarmXtream = getCachedXtreamLiveTdtChannels().length > 0;
    const runtimeSnap = getConnectedProvidersRuntimeCatalog();
    const tdtCacheKey = `${belixActive ? 'b1' : 'b0'}:${hasWarmXtream ? 'xw1' : 'xw0'}:rt${runtimeSnap.connectedCount}:${priorityMode}`;

    if (!forceRefresh) {
      const cachedPayload = tdtCatalogJsonCache.get(tdtCacheKey);
      if (cachedPayload) {
        return res.json(cachedPayload);
      }
    }

    const warmupTasks: Promise<unknown>[] = [];
    if (forceRefresh) {
      warmupTasks.push(
        refreshLiveIptvRegistry(true)
          .then(() => invalidateIptvChannelCache())
          .catch(() => undefined)
      );
    } else if (getIptvSyncMeta().lastSyncAt === 0) {
      warmupTasks.push(refreshLiveIptvRegistry(false).catch(() => undefined));
    } else {
      void refreshLiveIptvRegistry(false).catch(() => undefined);
    }

    if (isXtreamEnvConfigured() && (forceRefresh || !hasWarmXtream)) {
      const xtreamTask = syncXtreamEnvCatalog(forceRefresh, 'all').catch(() => undefined);
      if (forceRefresh) warmupTasks.push(xtreamTask);
      else void xtreamTask;
    }

    const warmupBudgetMs = forceRefresh ? 2200 : hasWarmXtream ? 0 : 400;
    const spainWarmupPromise = getVerifiedSpainXtreamChannels({
      waitWarmupMs: warmupBudgetMs,
      forceReprobe: forceRefresh,
    }).catch(() => []);
    if (warmupBudgetMs > 0) {
      warmupTasks.push(spainWarmupPromise);
      await Promise.race([
        Promise.allSettled(warmupTasks),
        new Promise<void>((resolve) => setTimeout(resolve, warmupBudgetMs)),
      ]);
    } else if (warmupTasks.length > 0) {
      await Promise.race([
        Promise.allSettled(warmupTasks),
        new Promise<void>((resolve) => setTimeout(resolve, 250)),
      ]);
    }

    const belixChannels = getBelixLiveChannels({ sessionKey: belixSessionKey });
    const belixStreamIds = new Set(belixChannels.map((c) => c.streamId));
    const verifiedSpainChannels = await Promise.race([
      spainWarmupPromise,
      new Promise<Awaited<typeof spainWarmupPromise>>((resolve) =>
        setTimeout(() => resolve(getCachedSpainXtreamChannelsSync()), 90)
      ),
    ]);
    const verifiedSpainStreamIds = new Set(verifiedSpainChannels.map((c) => c.streamId));
    const curatedRbtv = getCuratedRbtvChannels();
    const baseTdtChannels = applySyncedStreamsToChannels(SPANISH_TDT_CHANNELS, belixActive);

    const knownCanonicalKeys = new Set<string>();
    for (const ch of [...baseTdtChannels, ...INTERNATIONAL_TV_CHANNELS, ...verifiedSpainChannels]) {
      knownCanonicalKeys.add(resolveCanonicalChannelKey(ch));
    }

    // Enrich Spanish, Movistar, DAZN, and known curated/international channels with cross-provider signals without bloating JSON with 75k unrelated foreign feeds
    const xtreamEnvChannels = getCachedXtreamLiveTdtChannels().filter((c) => {
      if (belixStreamIds.has(c.streamId) || verifiedSpainStreamIds.has(c.streamId)) return false;
      if (c.countryCode === 'ES' || c.category === 'movistar' || c.category === 'dazn') return true;
      return knownCanonicalKeys.has(resolveCanonicalChannelKey(c));
    });

    // Integrate ALL connected runtime servers (vod4k, 24tv, dana4k, ultra-vip, adtupac, 2m2h-alt, sult-vo, octopus, primary)
    const seenRuntimePairs = new Set<string>(
      [...verifiedSpainChannels, ...xtreamEnvChannels].map(
        (c: any) => `${c.providerId || 'primary'}:${c.streamId}`
      )
    );
    const runtimeProviderTdtChannels: any[] = [];
    let runtimeDial = 700;
    for (const item of runtimeSnap.liveItems) {
      const pairKey = `${item.providerId}:${item.streamId}`;
      if (seenRuntimePairs.has(pairKey)) continue;
      const hay = `${item.name} ${item.categoryName}`.toLowerCase();
      const itemLang = String(item.lang || 'INTL').toUpperCase();
      const itemLangLabel = item.langLabel || itemLang;
      const itemQuality = item.quality || 'HD';
      const itemCleanTitle = item.cleanTitle || item.name;
      const isSpainOrMajor =
        itemLang === 'ES' ||
        itemLang === 'CAT' ||
        /\b(?:movistar|m\+|dazn|laliga|hypermotion|campeones|tdt|rtve|atresmedia|mediaset|la\s*1|la\s*2|antena\s*3|cuatro|telecinco|lasexta|teledeporte|eurosport|nba|f1|bein)\b/i.test(
          hay
        );
      const canonCandidate = {
        id: item.id,
        name: itemCleanTitle,
        category: 'entretenimiento',
      };
      const matchesKnownCanon = knownCanonicalKeys.has(resolveCanonicalChannelKey(canonCandidate));
      if (!isSpainOrMajor && !matchesKnownCanon) continue;
      seenRuntimePairs.add(pairKey);

      const cat: string = /\bdazn\b/i.test(hay)
        ? 'dazn'
        : /\b(?:movistar|m\+|laliga|hypermotion|campeones|vamos)\b/i.test(hay)
        ? 'movistar'
        : /\b(?:cine|movie|hollywood|amc|tcm|warner|axn|series)\b/i.test(hay)
        ? 'cine_series'
        : /\b(?:doc|discovery|nat\s*geo|historia|odisea|dmax)\b/i.test(hay)
        ? 'documentales'
        : /\b(?:infantil|kids|clan|boing|disney|nick)\b/i.test(hay)
        ? 'infantil_autonomicas'
        : /\b(?:espn|bein|sky\s*sports|tnt\s*sports|eurosport|deporte|sport)\b/i.test(hay)
        ? 'noticias_deportes'
        : itemLang === 'ES' || itemLang === 'CAT'
        ? 'generalistas'
        : 'europa_tv';

      runtimeProviderTdtChannels.push({
        id: `xtream-${item.providerId}-${item.streamId}`,
        streamId: item.streamId,
        dial: runtimeDial++,
        name: itemCleanTitle,
        shortMark: itemCleanTitle.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || 'TV',
        brandTone: '#7C3AED',
        network: item.providerName,
        category: cat,
        quality: itemQuality,
        countryCode: itemLang === 'ES' || itemLang === 'CAT' ? 'ES' : itemLang !== 'INTL' ? itemLang : undefined,
        logoUrl: item.poster,
        description: `${item.providerName} · ${itemLangLabel} · ${itemQuality}`,
        channels: [
          {
            id: item.id,
            label: `${item.providerName} · ${itemLangLabel} · ${itemQuality}`,
            lang: itemLang,
            langLabel: itemLangLabel,
            quality: itemQuality,
            providerId: item.providerId,
            providerName: item.providerName,
            sourceUrl: item.streamUrl,
            resolverType: 'direct_hls' as const,
          },
        ],
      });
      if (runtimeProviderTdtChannels.length >= 2400) break;
    }

    const merged = [
      ...verifiedSpainChannels,
      ...baseTdtChannels,
      ...INTERNATIONAL_TV_CHANNELS,
      ...belixChannels,
      ...xtreamEnvChannels,
      ...runtimeProviderTdtChannels,
      ...curatedRbtv,
    ];
    const unified = buildUnifiedPrioritizedChannels(merged, {
      preferQualityFirst: priorityMode === 'best_quality',
    });
    const curated = curateHealthyAlternatives(unified);
    const responsePayload = {
      success: true as const,
      iptvMeta: getIptvSyncMeta(),
      channels: curated.map((ch) => ({
        ...ch,
        logoUrl: resolveOfficialChannelLogoUrl(ch) || undefined,
      })),
    };
    if (responsePayload.channels.length > 0) {
      tdtCatalogJsonCache.set(
        `${belixActive ? 'b1' : 'b0'}:${hasWarmXtream || verifiedSpainChannels.length > 0 ? 'xw1' : 'xw0'}:rt${runtimeSnap.connectedCount}:${priorityMode}`,
        responsePayload
      );
    }
    res.json(responsePayload);
  });

  app.get(
    [
      '/naim-cine.m3u',
      '/naimcine.m3u',
      '/naimcine-smarttv.m3u',
      '/NAIM-CINE-Samsung-TV.m3u',
      '/NAIMCINE-Samsung-Tizen.m3u',
      '/riffantv.m3u',
      '/riffantv-smarttv.m3u',
      '/channels.m3u',
      '/playlist.m3u',
      '/iptv.m3u',
      '/naim-cine.m3u8',
      '/api/iptv/playlist.m3u',
    ],
    async (req, res) => {
      const forceRefresh = req.query.refresh === '1';
      if (forceRefresh) {
        await Promise.all([
          refreshLiveIptvRegistry(true).catch(() => undefined),
          refreshFamelackAndWorldCatalog(true).catch(() => undefined),
        ]);
        invalidateIptvChannelCache();
      } else {
        const tasks: Promise<unknown>[] = [refreshLiveIptvRegistry(false).catch(() => undefined)];
        if (getCachedFamelackWorldChannels().length === 0) {
          tasks.push(refreshFamelackAndWorldCatalog(false).catch(() => undefined));
        } else {
          void refreshFamelackAndWorldCatalog(false).catch(() => undefined);
        }
        await Promise.all(tasks);
      }

      const publicOrigin = getPublicOrigin(req);
      const groupFilter = String(req.query.group || '').trim().toLowerCase();
      const countryFilter = String(req.query.country || '').trim().toLowerCase();

      let channels = getAllIptvChannels();
      if (groupFilter && groupFilter !== 'all') {
        channels = channels.filter(
          (ch) =>
            (ch.category || '').toLowerCase() === groupFilter ||
            getIptvMacroGroup(ch.category || 'generalistas') === groupFilter
        );
      }
      if (countryFilter) {
        channels = channels.filter(
          (ch) => (ch.countryCode || '').toLowerCase() === countryFilter
        );
      }

      const lines: string[] = [
        `#EXTM3U x-tvg-url="${publicOrigin}/epg.xml" url-tvg="${publicOrigin}/epg.xml" refresh="3600"`,
      ];

      channels.forEach((ch, idx) => {
        const groupTitle = IPTV_GROUP_TITLES[ch.category] || 'TDT y Directo';
        const epgId = getIptvEpgId(ch.id);
        const chno = ch.dial ? String(ch.dial) : String(idx + 1);
        const officialLogo = resolveOfficialChannelLogoUrl(ch) || ch.logoUrl;
        const logoUrl =
          officialLogo && /^https?:\/\//i.test(officialLogo)
            ? officialLogo
            : `${publicOrigin}/api/iptv/logo/${encodeURIComponent(ch.id)}.png`;
        const streamUrl = `${publicOrigin}/api/iptv/live/${encodeURIComponent(ch.id)}.m3u8`;
        const safeName = String(ch.name || ch.id).replace(/[\r\n,]+/g, ' ').trim();

        lines.push(
          `#EXTINF:-1 tvg-id="${epgId}" tvg-name="${safeName}" tvg-chno="${chno}" tvg-logo="${logoUrl}" group-title="${groupTitle}",${safeName}`
        );
        lines.push(streamUrl);
      });

      const playlistBody = lines.join('\n') + '\n';
      const forceDownload = req.query.download === '1';

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Content-Type', 'audio/x-mpegurl; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Content-Length', String(Buffer.byteLength(playlistBody, 'utf8')));
      if (forceDownload) {
        res.setHeader('Content-Disposition', 'attachment; filename="RIFFANTV-IPTV.m3u"');
      }
      res.send(playlistBody);
    }
  );

  app.get('/api/iptv/status', async (req, res) => {
    if (req.query.refresh === '1') {
      await Promise.all([
        refreshLiveIptvRegistry(true).catch(() => undefined),
        refreshFamelackAndWorldCatalog(true).catch(() => undefined),
      ]);
      invalidateIptvChannelCache();
    } else if (getCachedFamelackWorldChannels().length === 0) {
      await refreshFamelackAndWorldCatalog(false).catch(() => undefined);
    }
    const channels = getAllIptvChannels();
    res.json({
      ok: true,
      totalChannels: channels.length,
      ...getIptvSyncMeta(),
    });
  });

  app.get('/api/iptv/summary', async (req, res) => {
    if (req.query.refresh === '1') {
      await Promise.all([
        refreshLiveIptvRegistry(true).catch(() => undefined),
        refreshFamelackAndWorldCatalog(true).catch(() => undefined),
      ]);
    } else if (getCachedFamelackWorldChannels().length === 0) {
      await refreshFamelackAndWorldCatalog(false).catch(() => undefined);
    }
    const publicOrigin = getPublicOrigin(req);
    const groupFilter = String(req.query.group || '').trim().toLowerCase();
    const countryFilter = String(req.query.country || '').trim().toLowerCase();
    let channels = getAllIptvChannels();
    if (groupFilter && groupFilter !== 'all') {
      channels = channels.filter(
        (ch) =>
          (ch.category || '').toLowerCase() === groupFilter ||
          getIptvMacroGroup(ch.category || 'generalistas') === groupFilter
      );
    }
    if (countryFilter) {
      channels = channels.filter(
        (ch) => (ch.countryCode || '').toLowerCase() === countryFilter
      );
    }

    const catMap: Record<string, { label: string; macroGroup: string; count: number; sampleChannels: string[] }> = {};
    const macroMap: Record<string, { id: string; label: string; count: number }> = {};

    channels.forEach((ch) => {
      const cat = ch.category || 'generalistas';
      const macro = getIptvMacroGroup(cat);
      const groupLabel = IPTV_GROUP_TITLES[cat] || 'TDT y Directo';
      if (!catMap[cat]) {
        catMap[cat] = { label: groupLabel, macroGroup: macro, count: 0, sampleChannels: [] };
      }
      catMap[cat].count++;
      if (catMap[cat].sampleChannels.length < 5) {
        catMap[cat].sampleChannels.push(ch.name);
      }
      if (!macroMap[macro]) {
        macroMap[macro] = {
          id: macro,
          label: IPTV_MACRO_GROUP_LABELS[macro] || macro,
          count: 0,
        };
      }
      macroMap[macro].count++;
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=180');
    res.json({
      ok: true,
      totalChannels: channels.length,
      m3uUrl: `${publicOrigin}/riffantv.m3u`,
      epgUrl: `${publicOrigin}/epg.xml`,
      riffantvM3uUrl: `${publicOrigin}/riffantv.m3u`,
      riffantvEpgUrl: `${publicOrigin}/epg.xml`,
      tvUrl: `${publicOrigin}/tv`,
      legacyM3uUrl: `${publicOrigin}/naim-cine.m3u`,
      groups: Object.values(macroMap),
      categories: Object.entries(catMap).map(([id, info]) => ({
        id,
        label: info.label,
        macroGroup: info.macroGroup,
        count: info.count,
        sampleChannels: info.sampleChannels,
      })),
      channels: channels.map((c, idx) => ({
        id: c.id,
        dial: c.dial || idx + 1,
        name: c.name,
        category: c.category,
        macroGroup: getIptvMacroGroup(c.category || 'generalistas'),
        countryCode: c.countryCode || undefined,
        network: c.network || undefined,
        groupTitle: IPTV_GROUP_TITLES[c.category] || 'TDT y Directo',
        quality: c.quality || '1080p HD',
        shortMark: c.shortMark || c.name.slice(0, 4).toUpperCase(),
        brandTone: c.brandTone || '#7C3AED',
        logoUrl: c.logoUrl || `${publicOrigin}/api/iptv/logo/${encodeURIComponent(c.id)}.png`,
      })),
    });
  });

  app.get('/api/iptv/logo/:channelId', (req, res) => {
    const rawId = String(req.params.channelId || '').replace(/\.png$/i, '');
    const ch = getIptvChannelById(rawId);
    const png = renderIptvChannelPng(ch?.shortMark || rawId.slice(0, 3), ch?.brandTone || '#E11D48');

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Length', String(png.length));
    res.end(png);
  });

  app.get('/api/iptv/live/:channelId', async (req, res) => {
    const rawId = String(req.params.channelId || '').replace(/\.m3u8$/i, '');
    const channel =
      getIptvChannelById(rawId) ||
      getIptvChannelById(`live-sports-${rawId}`) ||
      (rawId === 'mux-champions' ? getIptvChannelById('mplus-champions') : undefined);
    if (!channel) {
      return res.status(404).send('Channel not found');
    }

    const publicOrigin = getPublicOrigin(req);
    const forceAacOverride = req.query.aac === '1';
    const cached = iptvChannelResolveCache.get(channel.id);
    if (cached && Date.now() - cached.ts < (cached.isDvb ? 10 * 60 * 1000 : 45_000)) {
      if (cached.isDvb) {
        const activeDvbPath = getActiveDvbSessionPath(cached.rawM3u8Url);
        const dvbText =
          (activeDvbPath && readLiveDvbPlaylistForIptv(activeDvbPath, publicOrigin)) ||
          (await resolveDvbIptvPlaylistText(
            cached.rawM3u8Url,
            cached.referer,
            publicOrigin
          ));
        if (dvbText) {
          cached.ts = Date.now();
          return sendIptvM3u8Response(res, dvbText);
        }
        iptvChannelResolveCache.delete(channel.id);
      } else {
        const manifestObj = await fetchUpstreamManifestText(
          cached.rawM3u8Url,
          cached.referer,
          forceAacOverride || cached.forceAac
        );
        if (manifestObj) {
          const unwrapped = await unwrapMasterPlaylistForIptv(
            manifestObj,
            cached.referer,
            forceAacOverride || cached.forceAac
          );
          if (unwrapped) {
            const cacheAgeMs = Date.now() - cached.ts;
            const segOk = await verifyIptvMediaManifestSegments(
              unwrapped.text,
              unwrapped.finalUrl,
              cached.referer,
              { trustCachedHealth: cacheAgeMs < 22_000 }
            );
            if (segOk) {
              const trimmedText = trimLiveDvrManifestForIptv(unwrapped.text, 6);
              const rewritten = rewriteManifestForSamsungIptv(
                trimmedText,
                unwrapped.finalUrl,
                cached.referer,
                forceAacOverride || cached.forceAac,
                false,
                publicOrigin
              );
              return sendIptvM3u8Response(res, rewritten);
            }
          }
        }
        iptvChannelResolveCache.delete(channel.id);
      }
    }

    const markTrackDown = (url: string, statusCode = 502) => {
      const prev = channelHealthMonitor.getTrackHealth(url);
      channelHealthMonitor.setTrackHealth(url, {
        status: 'down',
        statusCode,
        failCount: (prev?.failCount || 0) + 1,
        checkedAt: Date.now(),
      });
    };

    const rawTracks: TrackRecord[] = Array.isArray(channel.channels) ? channel.channels : [];
    const tracks = channelHealthMonitor.prioritizeTracks(rawTracks);
    const triedDvbUrls = new Set<string>();
    const belixSidMatch = String(req.headers.cookie || '').match(/(?:^|;\s*)belix_sid=([^;]+)/);
    const belixSessionKey =
      String(req.headers['x-belix-session'] || '').trim() ||
      (belixSidMatch ? decodeURIComponent(belixSidMatch[1].trim()) : '') ||
      'default';

    const resolveSingleIptvTrack = async (track: TrackRecord): Promise<string | null> => {
      try {
        const sourceUrl = String(track?.sourceUrl || '').trim();
        if (!sourceUrl) return null;

        const isElahmad = track.resolverType === 'elahmad_live' || isElahmadUrl(sourceUrl);
        if (isElahmad) {
          const elResolved = await resolveElahmadChannelToHls(sourceUrl);
          if (!elResolved || elResolved.isYoutube) return null;
          const signedElUrl = await maybeSignEasyBroadcastUrl(elResolved.streamUrl);
          const manifestObj = await fetchUpstreamManifestText(signedElUrl, elResolved.referer, forceAacOverride);
          if (!manifestObj) return null;
          const unwrapped = await unwrapMasterPlaylistForIptv(manifestObj, elResolved.referer, forceAacOverride);
          if (!unwrapped) return null;
          const segOk = await verifyIptvMediaManifestSegments(
            unwrapped.text,
            unwrapped.finalUrl,
            elResolved.referer
          );
          if (!segOk) return null;
          const trimmedText = trimLiveDvrManifestForIptv(unwrapped.text, 6);
          iptvChannelResolveCache.set(channel.id, {
            rawM3u8Url: unwrapped.finalUrl,
            referer: elResolved.referer,
            forceAac: forceAacOverride,
            isPublicCorsCdn: false,
            isDvb: false,
            ts: Date.now(),
          });
          return rewriteManifestForSamsungIptv(
            trimmedText,
            unwrapped.finalUrl,
            elResolved.referer,
            forceAacOverride,
            false,
            publicOrigin
          );
        }

        if (track.resolverType === 'mediaset_live') {
          const msResolved = await resolveMediasetLiveHlsUrl(sourceUrl);
          if (!msResolved?.streamUrl) {
            markTrackDown(sourceUrl, 403);
            return null;
          }
          const manifestObj = await fetchUpstreamManifestText(
            msResolved.streamUrl,
            msResolved.referer,
            forceAacOverride
          );
          if (!manifestObj) {
            markTrackDown(sourceUrl, 502);
            return null;
          }
          const unwrapped = await unwrapMasterPlaylistForIptv(
            manifestObj,
            msResolved.referer,
            forceAacOverride
          );
          if (!unwrapped) {
            markTrackDown(sourceUrl, 404);
            return null;
          }
          const segOk = await verifyIptvMediaManifestSegments(
            unwrapped.text,
            unwrapped.finalUrl,
            msResolved.referer
          );
          if (!segOk) {
            markTrackDown(sourceUrl, 403);
            return null;
          }
          const trimmedText = trimLiveDvrManifestForIptv(unwrapped.text, 6);
          iptvChannelResolveCache.set(channel.id, {
            rawM3u8Url: unwrapped.finalUrl,
            referer: msResolved.referer,
            forceAac: forceAacOverride,
            isPublicCorsCdn: false,
            isDvb: false,
            ts: Date.now(),
          });
          return rewriteManifestForSamsungIptv(
            trimmedText,
            unwrapped.finalUrl,
            msResolved.referer,
            forceAacOverride,
            false,
            publicOrigin
          );
        }

        const isDirectHls =
          track.resolverType === 'tdt_hls' ||
          track.resolverType === 'direct_hls' ||
          /\.m3u8(\?|$)/i.test(sourceUrl);

        if (sourceUrl.startsWith('/api/belix/stream/')) {
          if (!isAnyBelixConnected(belixSessionKey)) {
            markTrackDown(sourceUrl, 503);
            return null;
          }
          const belixStreamId = sourceUrl.split('/').pop()?.replace(/\.m3u8.*$/i, '') || '';
          const belixManifest = await resolveBelixManifest(
            belixStreamId,
            publicOrigin,
            belixSessionKey,
            channel.name
          );
          if (!belixManifest) {
            markTrackDown(sourceUrl, 503);
            return null;
          }
          return belixManifest;
        }

        if (/^\/api\/(?:xtream\/stream\/|stream\b)/i.test(sourceUrl)) {
          let xtreamStreamId = '';
          let xtreamProvider = 'primary';
          if (sourceUrl.startsWith('/api/xtream/stream/')) {
            xtreamStreamId = sourceUrl.split('/').pop()?.replace(/\.m3u8.*$/i, '') || '';
          } else {
            try {
              const parsed = new URL(sourceUrl, 'http://localhost');
              xtreamStreamId = (parsed.searchParams.get('id') || '').replace(/\.m3u8$/i, '').trim();
              xtreamProvider = parsed.searchParams.get('provider') || 'primary';
            } catch {
              xtreamStreamId = '';
            }
          }
          if (xtreamStreamId) {
            const xtreamManifest = await fetchProxiedXtreamManifest(
              xtreamStreamId,
              publicOrigin,
              xtreamProvider
            );
            if (xtreamManifest) {
              return xtreamManifest;
            }
          }
          markTrackDown(sourceUrl, 503);
          return null;
        }

        if (isDirectHls) {
          const cleanUrl = await maybeSignEasyBroadcastUrl(
            sourceUrl.replace(/[?&]profile=(hd|fast)\b/gi, '')
          );
          const referer =
            resolveKnownUpstreamReferer(cleanUrl, track.referer) || new URL(cleanUrl).origin + '/';
          const forceAac = forceAacOverride;

          if (isDvbHeadendStream(cleanUrl)) {
            if (triedDvbUrls.has(cleanUrl)) {
              return null;
            }
            triedDvbUrls.add(cleanUrl);
            const activeDvbPath = getActiveDvbSessionPath(cleanUrl);
            if (activeDvbPath) {
              const warmPl = readLiveDvbPlaylistForIptv(activeDvbPath, publicOrigin);
              if (warmPl) {
                iptvChannelResolveCache.set(channel.id, {
                  rawM3u8Url: cleanUrl,
                  referer,
                  forceAac: false,
                  isPublicCorsCdn: false,
                  isDvb: true,
                  ts: Date.now(),
                });
                return warmPl;
              }
            }
            const dvbPlaylist = await resolveDvbIptvPlaylistText(cleanUrl, referer, publicOrigin);
            if (dvbPlaylist) {
              iptvChannelResolveCache.set(channel.id, {
                rawM3u8Url: cleanUrl,
                referer,
                forceAac: false,
                isPublicCorsCdn: false,
                isDvb: true,
                ts: Date.now(),
              });
              return dvbPlaylist;
            }
            markTrackDown(sourceUrl, 502);
            return null;
          }

          const manifestObj = await fetchUpstreamManifestText(cleanUrl, referer, forceAac);
          if (!manifestObj) {
            markTrackDown(sourceUrl, 502);
            return null;
          }

          const unwrapped = await unwrapMasterPlaylistForIptv(manifestObj, referer, forceAac);
          if (!unwrapped) {
            markTrackDown(sourceUrl, 404);
            return null;
          }

          const segOk = await verifyIptvMediaManifestSegments(
            unwrapped.text,
            unwrapped.finalUrl,
            referer
          );
          if (!segOk) {
            markTrackDown(sourceUrl, 403);
            return null;
          }

          const trimmedText = trimLiveDvrManifestForIptv(unwrapped.text, 6);

          iptvChannelResolveCache.set(channel.id, {
            rawM3u8Url: unwrapped.finalUrl,
            referer,
            forceAac,
            isPublicCorsCdn: false,
            isDvb: false,
            ts: Date.now(),
          });

          return rewriteManifestForSamsungIptv(
            trimmedText,
            unwrapped.finalUrl,
            referer,
            forceAac,
            false,
            publicOrigin
          );
        }

        const fullTarget = /^https?:\/\//i.test(sourceUrl) ? sourceUrl : `https://${sourceUrl}`;
        let directSports = await extractLiveSportsHlsDirect(fullTarget);
        if (directSports?.isBrokenGreenFeed) return null;

        const isKnownDirectMirror = /footunder\.online|tilinhd\.|streamxhd\./i.test(fullTarget);
        if (!directSports && !isKnownDirectMirror) {
          directSports = await sniffStreamWithHeadless(fullTarget);
        }
        if (!directSports || !directSports.streamUrl || directSports.isDirectMp4) return null;

        const manifestObj = await fetchUpstreamManifestText(
          directSports.streamUrl,
          directSports.referer,
          false
        );
        if (!manifestObj) return null;

        const unwrapped = await unwrapMasterPlaylistForIptv(manifestObj, directSports.referer, false);
        if (!unwrapped) return null;

        const clean = await verifyM3u8HasCleanVideoFrame(
          unwrapped.text,
          unwrapped.finalUrl,
          directSports.referer
        );
        if (!clean) return null;

        const trimmedText = trimLiveDvrManifestForIptv(unwrapped.text, 6);

        iptvChannelResolveCache.set(channel.id, {
          rawM3u8Url: unwrapped.finalUrl,
          referer: directSports.referer,
          forceAac: forceAacOverride,
          isPublicCorsCdn: false,
          isDvb: false,
          ts: Date.now(),
        });

        return rewriteManifestForSamsungIptv(
          trimmedText,
          unwrapped.finalUrl,
          directSports.referer,
          forceAacOverride,
          false,
          publicOrigin
        );
      } catch {
        return null;
      }
    };

    const topFastBatch = tracks.slice(0, 4);
    if (topFastBatch.length > 0) {
      const fastWinner = await Promise.any(
        topFastBatch.map(async (track) => {
          const playlist = await resolveSingleIptvTrack(track);
          if (!playlist) throw new Error('track_failed');
          return playlist;
        })
      ).catch(() => null);
      if (fastWinner) {
        return sendIptvM3u8Response(res, fastWinner);
      }
    }

    const remainingTracks = tracks.slice(4);
    for (let offset = 0; offset < remainingTracks.length; offset += 4) {
      const wave = remainingTracks.slice(offset, offset + 4);
      const waveWinner = await Promise.any(
        wave.map(async (track) => {
          const playlist = await resolveSingleIptvTrack(track);
          if (!playlist) throw new Error('track_failed');
          return playlist;
        })
      ).catch(() => null);
      if (waveWinner) {
        return sendIptvM3u8Response(res, waveWinner);
      }
    }

    // Xtream live catalog fallback for sports/TDT channels when listed tracks fail
    if (channel.name) {
      const xtreamMatches = await findXtreamLiveChannelMatches({
        channelHints: [channel.name, rawId.replace(/[-_]+/g, ' ')],
        preferLang: 'ES',
        limit: 4,
      }).catch(() => []);
      if (xtreamMatches.length > 0) {
        const xtreamWinner = await Promise.any(
          xtreamMatches.map(async (xm) => {
            const playlist = await resolveSingleIptvTrack(xm);
            if (!playlist) throw new Error('xtream_failed');
            return playlist;
          })
        ).catch(() => null);
        if (xtreamWinner) {
          return sendIptvM3u8Response(res, xtreamWinner);
        }
      }
    }

    return res.status(503).send('Canal temporalmente sin señal disponible');
  });

  app.get(['/epg.xml', '/riffantv-epg.xml', '/api/iptv/epg.xml'], async (req, res) => {
    try {
      const publicOrigin = getPublicOrigin(req);
      const forceDownload = req.query.download === '1';
      let xmlPayload = epgXmlResponseCache.get(publicOrigin);
      if (!xmlPayload) {
        const store = await loadSpanishEpgSchedule();
        const channels = getAllIptvChannels();
        const xmlParts: string[] = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<tv generator-info-name="RIFFANTV IPTV EPG" generator-info-url="' +
            escapeXmlText(publicOrigin) +
            '">',
        ];

        const emittedChannelIds = new Set<string>();
        for (const ch of channels) {
          const epgId = getIptvEpgId(ch.id);
          if (emittedChannelIds.has(epgId)) continue;
          emittedChannelIds.add(epgId);
          const officialLogo = resolveOfficialChannelLogoUrl(ch) || ch.logoUrl;
          const logoUrl =
            officialLogo && /^https?:\/\//i.test(officialLogo)
              ? officialLogo
              : `${publicOrigin}/api/iptv/logo/${encodeURIComponent(ch.id)}.png`;
          xmlParts.push(`  <channel id="${escapeXmlText(epgId)}">`);
          xmlParts.push(`    <display-name lang="es">${escapeXmlText(ch.name)}</display-name>`);
          xmlParts.push(`    <icon src="${escapeXmlText(logoUrl)}" />`);
          xmlParts.push('  </channel>');
        }

        const now = Date.now();
        for (const ch of channels) {
          const epgId = getIptvEpgId(ch.id);
          const events = store.get(epgId) || [];
          if (events.length > 0) {
            for (const ev of events) {
              xmlParts.push(
                `  <programme start="${formatXmltvUtcTime(ev.startMs)}" stop="${formatXmltvUtcTime(
                  ev.stopMs
                )}" channel="${escapeXmlText(epgId)}">`
              );
              xmlParts.push(`    <title lang="es">${escapeXmlText(ev.title)}</title>`);
              if (ev.subtitle) {
                xmlParts.push(`    <sub-title lang="es">${escapeXmlText(ev.subtitle)}</sub-title>`);
              }
              if (ev.description) {
                xmlParts.push(`    <desc lang="es">${escapeXmlText(ev.description)}</desc>`);
              }
              if (ev.category) {
                xmlParts.push(`    <category lang="es">${escapeXmlText(ev.category)}</category>`);
              }
              xmlParts.push('  </programme>');
            }
          } else {
            const blockDuration = 4 * 60 * 60 * 1000;
            const currentBlockStart = Math.floor(now / blockDuration) * blockDuration;
            for (let b = 0; b < 6; b++) {
              const bStart = currentBlockStart + b * blockDuration;
              const bStop = bStart + blockDuration;
              const blockTitle = ch.category?.includes('futbol') || ch.category?.includes('movistar') || ch.category?.includes('dazn')
                ? `${ch.name} · Fútbol y Deportes en Directo HD`
                : ch.category === 'documentales'
                ? `${ch.name} · Documentales y Naturaleza HD`
                : ch.category === 'cine_series'
                ? `${ch.name} · Cine y Series en Emisión Continua`
                : `${ch.name} · Emisión en Directo HD`;

              xmlParts.push(
                `  <programme start="${formatXmltvUtcTime(bStart)}" stop="${formatXmltvUtcTime(bStop)}" channel="${escapeXmlText(epgId)}">`
              );
              xmlParts.push(`    <title lang="es">${escapeXmlText(blockTitle)}</title>`);
              xmlParts.push(`    <desc lang="es">${escapeXmlText(ch.description || `Transmisión oficial en directo de ${ch.name} sin cortes para Smart TV.`)}</desc>`);
              xmlParts.push(`    <category lang="es">${escapeXmlText(IPTV_GROUP_TITLES[ch.category] || 'Directo')}</category>`);
              xmlParts.push('  </programme>');
            }
          }
        }

        xmlParts.push('</tv>');
        xmlPayload = xmlParts.join('\n');
        epgXmlResponseCache.set(publicOrigin, xmlPayload);
      }

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=300');
      if (forceDownload) {
        res.setHeader('Content-Disposition', 'attachment; filename="RIFFANTV-EPG.xml"');
      }
      res.send(xmlPayload);
    } catch (err) {
      logger.warn({ err }, '/epg.xml error');
      res.status(500).type('application/xml').send('<tv></tv>');
    }
  });
}
