/**
 * @module server/routes/iptv
 * @description TDT catalog API + Smart TV IPTV suite (.m3u playlists, live HLS resolver, PNG channel badges, and XMLTV /epg.xml).
 */
import type { Express, Request } from 'express';
import { resolveOfficialChannelLogoUrl } from '../../src/shared/channelLogos.ts';
import { LruTtlCache } from '../utils/lruCache.ts';
import {
  maybeSignEasyBroadcastUrl,
  resolveKnownUpstreamReferer,
  type TrackRecord,
} from '../extractors/httpHelpers.ts';
import { extractLiveSportsHlsDirect, sniffStreamWithHeadless, verifyM3u8HasCleanVideoFrame } from '../extractors/sportsExtractor.ts';
import { isElahmadUrl, resolveElahmadChannelToHls } from '../extractors/elahmadExtractor.ts';
import { SPANISH_TDT_CHANNELS } from '../data/tdtChannels.ts';
import {
  applySyncedStreamsToChannels,
  getIptvSyncMeta,
  refreshLiveIptvRegistry,
} from '../services/iptvPlaylistService.ts';
import { channelHealthMonitor } from '../services/channelHealthMonitor.ts';
import { loadSpanishEpgSchedule } from '../services/epgService.ts';
import { getAllIptvChannels } from './iptvHelpers/iptvChannelRegistry.ts';
import {
  IPTV_GROUP_TITLES,
  escapeXmlText,
  fetchUpstreamManifestText,
  formatXmltvUtcTime,
  getIptvEpgId,
  renderIptvChannelPng,
  rewriteManifestForSamsungIptv,
  unwrapMasterPlaylistForIptv,
} from './iptvHelpers/iptvMediaHelpers.ts';

export function getLiveVoiceChannels() {
  const merged = applySyncedStreamsToChannels(SPANISH_TDT_CHANNELS);
  return channelHealthMonitor.prioritizeChannels(merged).map((ch) => ({
    ...ch,
    logoUrl: ch.logoUrl || resolveOfficialChannelLogoUrl(ch) || undefined,
  }));
}





const iptvChannelResolveCache = new LruTtlCache<
  string,
  {
    rawM3u8Url: string;
    referer: string;
    forceAac: boolean;
    isPublicCorsCdn: boolean;
    ts: number;
  }
>(150, 20 * 60 * 1000);



export function registerIptvAndTdtRoutes(
  app: Express,
  deps: { getPublicOrigin: (req: Request) => string }
): void {
  const { getPublicOrigin } = deps;

  app.get('/api/catalog/tdt', async (req, res) => {
    if (req.query.refresh === '1') {
      await refreshLiveIptvRegistry(true).catch(() => undefined);
    } else {
      void refreshLiveIptvRegistry(false).catch(() => undefined);
    }
    const merged = applySyncedStreamsToChannels(SPANISH_TDT_CHANNELS);
    res.json({
      success: true,
      iptvMeta: getIptvSyncMeta(),
      channels: channelHealthMonitor.prioritizeChannels(merged).map((ch) => ({
        ...ch,
        logoUrl: ch.logoUrl || resolveOfficialChannelLogoUrl(ch) || undefined,
      })),
    });
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
      if (req.query.refresh === '1') {
        await refreshLiveIptvRegistry(true).catch(() => undefined);
      } else {
        await refreshLiveIptvRegistry(false).catch(() => undefined);
      }
      const publicOrigin = getPublicOrigin(req);
      const channels = getAllIptvChannels();
      const lines: string[] = [
        `#EXTM3U x-tvg-url="${publicOrigin}/epg.xml" url-tvg="${publicOrigin}/epg.xml"`,
      ];

      channels.forEach((ch, idx) => {
        const groupTitle = IPTV_GROUP_TITLES[ch.category] || 'TDT y Directo';
        const epgId = getIptvEpgId(ch.id);
        const chno = ch.dial ? String(ch.dial) : String(idx + 1);
        const officialLogo = ch.logoUrl || resolveOfficialChannelLogoUrl(ch);
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
      if (forceDownload) {
        res.setHeader('Content-Disposition', 'attachment; filename="RIFFANTV-IPTV.m3u"');
      }
      res.send(playlistBody);
    }
  );

  app.get('/api/iptv/status', async (req, res) => {
    if (req.query.refresh === '1') {
      await refreshLiveIptvRegistry(true).catch(() => undefined);
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
      await refreshLiveIptvRegistry(true).catch(() => undefined);
    }
    const publicOrigin = getPublicOrigin(req);
    const channels = getAllIptvChannels();
    const catMap: Record<string, { label: string; count: number; sampleChannels: string[] }> = {};

    channels.forEach((ch) => {
      const cat = ch.category || 'generalistas';
      const groupLabel = IPTV_GROUP_TITLES[cat] || 'TDT y Directo';
      if (!catMap[cat]) {
        catMap[cat] = { label: groupLabel, count: 0, sampleChannels: [] };
      }
      catMap[cat].count++;
      if (catMap[cat].sampleChannels.length < 5) {
        catMap[cat].sampleChannels.push(ch.name);
      }
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
      kidsUrl: `${publicOrigin}/kids`,
      legacyM3uUrl: `${publicOrigin}/naim-cine.m3u`,
      categories: Object.entries(catMap).map(([id, info]) => ({
        id,
        label: info.label,
        count: info.count,
        sampleChannels: info.sampleChannels,
      })),
      channels: channels.map((c, idx) => ({
        id: c.id,
        dial: c.dial || idx + 1,
        name: c.name,
        category: c.category,
        groupTitle: IPTV_GROUP_TITLES[c.category] || 'TDT y Directo',
        quality: c.quality || '1080p HD',
        shortMark: c.shortMark || c.name.slice(0, 4).toUpperCase(),
        brandTone: c.brandTone || '#9146FF',
        logoUrl: c.logoUrl || `${publicOrigin}/api/iptv/logo/${encodeURIComponent(c.id)}.png`,
      })),
    });
  });

  app.get('/api/iptv/logo/:channelId', (req, res) => {
    const rawId = String(req.params.channelId || '').replace(/\.png$/i, '');
    const ch = getAllIptvChannels().find((c) => c.id === rawId);
    const png = renderIptvChannelPng(ch?.shortMark || rawId.slice(0, 3), ch?.brandTone || '#E11D48');

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Length', String(png.length));
    res.end(png);
  });

  app.get('/api/iptv/live/:channelId', async (req, res) => {
    const rawId = String(req.params.channelId || '').replace(/\.m3u8$/i, '');
    const channel = getAllIptvChannels().find((c) => c.id === rawId);
    if (!channel) {
      return res.status(404).send('Channel not found');
    }

    const publicOrigin = getPublicOrigin(req);
    const forceAacOverride = req.query.aac === '1';
    const cached = iptvChannelResolveCache.get(channel.id);
    if (cached && Date.now() - cached.ts < 45_000) {
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
        const rewritten = rewriteManifestForSamsungIptv(
          unwrapped.text,
          unwrapped.finalUrl,
          cached.referer,
          forceAacOverride || cached.forceAac,
          false,
          publicOrigin
        );
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.send(rewritten);
      }
      iptvChannelResolveCache.delete(channel.id);
    }

    const rawTracks: TrackRecord[] = Array.isArray(channel.channels) ? channel.channels : [];
    const tracks = channelHealthMonitor.prioritizeTracks(rawTracks);
    for (const track of tracks) {
      try {
        const sourceUrl = String(track?.sourceUrl || '').trim();
        if (!sourceUrl) continue;

        const isElahmad = track.resolverType === 'elahmad_live' || isElahmadUrl(sourceUrl);
        if (isElahmad) {
          const elResolved = await resolveElahmadChannelToHls(sourceUrl);
          if (!elResolved || elResolved.isYoutube) continue;
          const signedElUrl = await maybeSignEasyBroadcastUrl(elResolved.streamUrl);
          const manifestObj = await fetchUpstreamManifestText(signedElUrl, elResolved.referer, forceAacOverride);
          if (!manifestObj) continue;
          const unwrapped = await unwrapMasterPlaylistForIptv(manifestObj, elResolved.referer, forceAacOverride);
          iptvChannelResolveCache.set(channel.id, {
            rawM3u8Url: unwrapped.finalUrl,
            referer: elResolved.referer,
            forceAac: forceAacOverride,
            isPublicCorsCdn: false,
            ts: Date.now(),
          });
          const rewritten = rewriteManifestForSamsungIptv(
            unwrapped.text,
            unwrapped.finalUrl,
            elResolved.referer,
            forceAacOverride,
            false,
            publicOrigin
          );
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', '*');
          res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          return res.send(rewritten);
        }

        const isDirectHls =
          track.resolverType === 'tdt_hls' ||
          track.resolverType === 'direct_hls' ||
          /\.m3u8(\?|$)/i.test(sourceUrl);

        if (isDirectHls) {
          const cleanUrl = await maybeSignEasyBroadcastUrl(
            sourceUrl.replace(/[?&]profile=(hd|fast)\b/gi, '')
          );
          const referer =
            resolveKnownUpstreamReferer(cleanUrl, track.referer) || new URL(cleanUrl).origin + '/';
          const forceAac = forceAacOverride;

          const manifestObj = await fetchUpstreamManifestText(cleanUrl, referer, forceAac);
          if (!manifestObj) continue;

          const unwrapped = await unwrapMasterPlaylistForIptv(manifestObj, referer, forceAac);

          iptvChannelResolveCache.set(channel.id, {
            rawM3u8Url: unwrapped.finalUrl,
            referer,
            forceAac,
            isPublicCorsCdn: false,
            ts: Date.now(),
          });

          const rewritten = rewriteManifestForSamsungIptv(
            unwrapped.text,
            unwrapped.finalUrl,
            referer,
            forceAac,
            false,
            publicOrigin
          );
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', '*');
          res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          return res.send(rewritten);
        }

        const fullTarget = /^https?:\/\//i.test(sourceUrl) ? sourceUrl : `https://${sourceUrl}`;
        let directSports = await extractLiveSportsHlsDirect(fullTarget);
        if (directSports?.isBrokenGreenFeed) continue;

        const isKnownDirectMirror = /footunder\.online|tilinhd\.|streamxhd\./i.test(fullTarget);
        if (!directSports && !isKnownDirectMirror) {
          directSports = await sniffStreamWithHeadless(fullTarget);
        }
        if (!directSports || !directSports.streamUrl || directSports.isDirectMp4) continue;

        const manifestObj = await fetchUpstreamManifestText(
          directSports.streamUrl,
          directSports.referer,
          false
        );
        if (!manifestObj) continue;

        const unwrapped = await unwrapMasterPlaylistForIptv(manifestObj, directSports.referer, false);

        const clean = await verifyM3u8HasCleanVideoFrame(
          unwrapped.text,
          unwrapped.finalUrl,
          directSports.referer
        );
        if (!clean) continue;

        iptvChannelResolveCache.set(channel.id, {
          rawM3u8Url: unwrapped.finalUrl,
          referer: directSports.referer,
          forceAac: forceAacOverride,
          isPublicCorsCdn: false,
          ts: Date.now(),
        });

        const rewritten = rewriteManifestForSamsungIptv(
          unwrapped.text,
          unwrapped.finalUrl,
          directSports.referer,
          forceAacOverride,
          false,
          publicOrigin
        );
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.send(rewritten);
      } catch {
        // try next backup track
      }
    }

    return res.status(503).send('Canal temporalmente sin señal disponible');
  });

  app.get(['/epg.xml', '/riffantv-epg.xml', '/api/iptv/epg.xml'], async (req, res) => {
    try {
      const publicOrigin = getPublicOrigin(req);
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
        const officialLogo = ch.logoUrl || resolveOfficialChannelLogoUrl(ch);
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
      const forceDownload = req.query.download === '1';
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=300');
      if (forceDownload) {
        res.setHeader('Content-Disposition', 'attachment; filename="RIFFANTV-EPG.xml"');
      }
      res.send(xmlParts.join('\n'));
    } catch (err) {
      console.warn('/epg.xml error:', err);
      res.status(500).type('application/xml').send('<tv></tv>');
    }
  });
}
