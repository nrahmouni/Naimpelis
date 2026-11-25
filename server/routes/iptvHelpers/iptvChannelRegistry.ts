/**
 * @module server/routes/iptvHelpers/iptvChannelRegistry
 * @description Unified IPTV channel registry builder merging Spanish TDT, Català,
 * 24/7 Sports multiplexes, International, Elahmad, Famelack World, Free-TV, and Kids channels.
 */
import { SPANISH_TDT_CHANNELS } from '../../data/tdtChannels.ts';
import { CATALA_LIVE_CHANNELS } from '../../data/catalaRegistry.ts';
import { INTERNATIONAL_TV_CHANNELS } from '../../data/internationalChannels.ts';
import { FAST_THEMATIC_CHANNELS } from '../../services/catalogDiscoveryService.ts';
import { applySyncedStreamsToChannels } from '../../services/iptvPlaylistService.ts';
import { getCachedFamelackWorldChannels } from '../../services/famelackIptvService.ts';
import { buildUnifiedPrioritizedChannels } from '../../services/channelQualityMatcher.ts';
import { getPermanent247SportsMatches } from '../sports.ts';
import { getBelixLiveChannels } from '../../services/belix/belixXtreamClient.ts';
import { getCachedXtreamLiveTdtChannels } from '../../services/xtreamService.ts';
import { getCachedSpainXtreamChannelsSync } from '../../services/octopusSpainLiveService.ts';
import { curateSportsTracks, getCuratedRbtvChannels } from '../../services/rbtv/rbtvLiveCurator.ts';

interface CachedIptvSnapshot {
  channels: any[];
  byId: Map<string, any>;
  builtAt: number;
}

const IPTV_REGISTRY_CACHE_TTL_MS = 15_000;
let cachedIptvSnapshot: CachedIptvSnapshot | null = null;

export function invalidateIptvChannelCache(): void {
  cachedIptvSnapshot = null;
}

export function getIptvChannelById(id: string): any | undefined {
  getAllIptvChannels();
  return cachedIptvSnapshot?.byId.get(id);
}

export function getAllIptvChannels(): any[] {
  const now = Date.now();
  if (cachedIptvSnapshot && now - cachedIptvSnapshot.builtAt < IPTV_REGISTRY_CACHE_TTL_MS) {
    return cachedIptvSnapshot.channels;
  }

  const seen = new Set<string>();
  const combined: any[] = [];

  const mergedTdt = applySyncedStreamsToChannels(SPANISH_TDT_CHANNELS);
  for (const ch of mergedTdt) {
    if (!ch?.id || seen.has(ch.id)) continue;
    seen.add(ch.id);
    combined.push({
      ...ch,
      dial: ch.dial || combined.length + 1,
      category: ch.category || 'generalistas',
    });
  }

  for (const ch of CATALA_LIVE_CHANNELS) {
    if (!ch?.id || seen.has(ch.id)) continue;
    seen.add(ch.id);
    combined.push({
      ...ch,
      dial: ch.dial || combined.length + 1,
      category: ch.category || 'infantil_autonomicas',
    });
  }

  const sportsMuxes = getPermanent247SportsMatches();
  sportsMuxes.forEach((m, idx) => {
    const curatedTracks = curateSportsTracks(m.channels as any);
    if (curatedTracks.length === 0) return;
    const muxId = `live-sports-${m.id}`;
    if (!seen.has(muxId)) {
      seen.add(muxId);
      const isLaliga = m.id.includes('laliga');
      const isF1 = m.id.includes('f1');
      const isChampions = m.id.includes('champions');
      const isCricket = m.id.includes('cricket');
      const category = isLaliga
        ? 'movistar'
        : isF1
        ? 'dazn'
        : isChampions
        ? 'movistar'
        : isCricket
        ? 'world_cricket'
        : 'noticias_deportes';
      combined.push({
        id: muxId,
        dial: 201 + idx,
        name: m.title.split(' · ')[0] || m.title,
        shortMark: isLaliga ? 'LIGA' : isF1 ? 'F1' : isChampions ? 'UCL' : isCricket ? 'CRIC' : 'SPRT',
        brandTone: isLaliga ? '#0EA5E9' : isF1 ? '#F59E0B' : isCricket ? '#16A34A' : '#E11D48',
        network: m.competition || 'Fútbol 24/7',
        category,
        quality: '1080p HD',
        description: `${m.title} · ${m.competition}`,
        channels: curatedTracks,
      });
    }

    curatedTracks.forEach((tr, trIdx) => {
      const trId = `ch-sport-${tr.id || `${m.id}-${trIdx}`}`;
      if (!seen.has(trId) && tr.label && !tr.label.includes('Satélite')) {
        seen.add(trId);
        const cat = /movistar|m\+/i.test(tr.label)
          ? 'movistar'
          : /dazn/i.test(tr.label)
          ? 'dazn'
          : /espn/i.test(tr.label)
          ? 'espn'
          : /dsports/i.test(tr.label)
          ? 'dsports'
          : /tnt/i.test(tr.label)
          ? 'tnt_space'
          : /willow|sony|star|dd sport|cricket|bahrain/i.test(tr.label)
          ? 'world_cricket'
          : 'noticias_deportes';
        combined.push({
          id: trId,
          dial: 210 + combined.filter((c) => c.dial >= 210 && c.dial < 300).length,
          name: `${tr.label} 24/7`,
          shortMark: tr.label.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || 'SPRT',
          brandTone: '#9146FF',
          network: m.competition || 'Deportes en Directo',
          category: cat,
          quality: tr.quality || '1080p HD',
          description: `${tr.label} - Señal oficial en directo`,
          channels: [tr, ...curatedTracks.filter((other) => other.id !== tr.id)],
        });
      }
    });
  });

  for (const ch of INTERNATIONAL_TV_CHANNELS) {
    if (!ch?.id || seen.has(ch.id)) continue;
    seen.add(ch.id);
    combined.push({
      ...ch,
      dial: ch.dial || 300 + combined.filter((c) => c.dial >= 300 && c.dial < 500).length,
      category: ch.category || 'internacional',
    });
  }

  for (const f of FAST_THEMATIC_CHANNELS) {
    const fId = `fast-${f.id}`;
    if (!seen.has(fId) && !seen.has(f.id)) {
      seen.add(fId);
      const cat =
        f.category === 'news' || f.category === 'sports'
          ? 'noticias_deportes'
          : f.category === 'documentary'
          ? 'documentales'
          : 'cine_series';
      combined.push({
        id: fId,
        dial: 501 + combined.filter((c) => c.dial >= 500 && c.dial < 600).length,
        name: f.name,
        shortMark: f.mark || f.name.slice(0, 4).toUpperCase(),
        brandTone: f.tone || '#9146FF',
        network: 'FAST TV 24/7',
        category: cat,
        quality: f.quality || '1080p HD',
        description: f.descriptionEs || f.name,
        channels: [
          {
            id: `${f.id}-direct`,
            label: `${f.name} HD`,
            lang: 'ES',
            quality: f.quality || '1080p',
            sourceUrl: f.streamUrl,
            resolverType: 'tdt_hls',
          },
        ],
      });
    }
  }

  for (const w of getCachedFamelackWorldChannels()) {
    if (!w?.id || seen.has(w.id)) continue;
    seen.add(w.id);
    combined.push({
      ...w,
      dial: w.dial || 600 + combined.filter((c) => c.dial >= 600).length,
      category: w.category || 'adrar_europa',
    });
  }

  for (const b of getBelixLiveChannels({ includeAll: true })) {
    if (!b?.id || seen.has(b.id)) continue;
    seen.add(b.id);
    combined.push(b);
  }

  for (const s of getCachedSpainXtreamChannelsSync()) {
    if (!s?.id) continue;
    combined.push(s);
  }

  for (const x of getCachedXtreamLiveTdtChannels()) {
    if (!x?.id || seen.has(x.id)) continue;
    seen.add(x.id);
    combined.push(x);
  }

  for (const r of getCuratedRbtvChannels()) {
    if (!r?.id || seen.has(r.id)) continue;
    seen.add(r.id);
    combined.push(r);
  }

  const prioritized = buildUnifiedPrioritizedChannels(combined);
  const byId = new Map<string, any>();
  for (const ch of prioritized) {
    if (ch?.id) byId.set(ch.id, ch);
  }
  cachedIptvSnapshot = { channels: prioritized, byId, builtAt: Date.now() };
  return prioritized;
}
