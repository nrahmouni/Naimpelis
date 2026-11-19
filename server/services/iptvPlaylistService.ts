import type { TrackRecord } from '../extractors/httpHelpers.ts';
import { logger } from '../utils/logger.ts';

export interface LiveIptvChannelEntry {
  id: string;
  dial?: number;
  name: string;
  shortMark?: string;
  brandTone?: string;
  network?: string;
  category: string;
  quality?: string;
  description?: string;
  logoUrl?: string;
  channels: TrackRecord[];
  updatedAt?: number;
  isLiveSynced?: boolean;
}

interface TdtChannelsJsonRoot {
  countries?: Array<{
    name?: string;
    ambits?: Array<{
      name?: string;
      channels?: Array<{
        name?: string;
        web?: string;
        logo?: string;
        epg_id?: string;
        options?: Array<{
          format?: string;
          url?: string;
          geo2?: string | null;
          res?: string | null;
          lang?: string | null;
        }>;
      }>;
    }>;
  }>;
}

const SYNC_INTERVAL_MS = 30 * 60 * 1000;

let lastSyncAt = 0;
let syncPromise: Promise<void> | null = null;
let syncedUrlMap = new Map<string, { urls: string[]; logo?: string; web?: string }>();
let discoveredExtraChannels: LiveIptvChannelEntry[] = [];

function normName(val: string): string {
  return String(val || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isPlayableHlsUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  if (/\.mpd(\?|$|#)/i.test(url)) return false;
  if (/youtube\.com|youtu\.be|twitch\.tv|dailymotion\.com|vimeo\.com/i.test(url)) return false;
  return /\.m3u8(\?|$|#)|\/hls\/|\/manifest/i.test(url);
}

const KNOWN_TDT_ALIASES: Record<string, string[]> = {
  'tdt-la1': ['la 1', 'tve la 1', 'la 1 uhd'],
  'tdt-la2': ['la 2', 'tve la 2'],
  'tdt-24h': ['24h', 'canal 24 horas', '24 horas'],
  'tdt-tdp': ['teledeporte', 'tdp'],
  'tdt-clan': ['clan', 'clan tv'],
  'tdt-antena3': ['antena 3', 'antena 3 internacional'],
  'tdt-cuatro': ['cuatro'],
  'tdt-telecinco': ['telecinco'],
  'tdt-lasexta': ['lasexta', 'la sexta'],
  'tdt-neox': ['neox'],
  'tdt-nova': ['nova'],
  'tdt-mega': ['mega'],
  'tdt-atreseries': ['atreseries'],
  'tdt-fdf': ['fdf', 'factoria de ficcion'],
  'tdt-energy': ['energy'],
  'tdt-divinity': ['divinity'],
  'tdt-bemad': ['be mad', 'bemad'],
  'tdt-boing': ['boing'],
  'tdt-paramount': ['paramount network', 'paramount'],
  'tdt-dmax': ['dmax'],
  'tdt-dkiss': ['dkiss'],
  'tdt-ten': ['ten'],
  'tdt-trece': ['trece', '13tv'],
  'tdt-gol': ['gol play', 'gol'],
  'tdt-rmtv': ['real madrid tv', 'rmtv'],
  'tdt-3cat': ['tv3', '3cat', 'tv3cat'],
  'tdt-324': ['324', '3 24'],
  'tdt-esport3': ['esport3', 'esport 3'],
  'tdt-sx3': ['sx3', 'super3'],
  'tdt-etb1': ['etb 1', 'etb1'],
  'tdt-etb2': ['etb 2', 'etb2'],
  'tdt-canalsur': ['canal sur', 'canal sur andalucia'],
  'tdt-tvcanaria': ['tv canaria', 'television canaria'],
  'tdt-telemadrid': ['telemadrid'],
  'tdt-tvg': ['tvg', 'tv galicia'],
  'tdt-apunt': ['a punt', 'apunt'],
};

const CURATED_IPTV_ORG_ADDONS: LiveIptvChannelEntry[] = [
  {
    id: 'tdt-rtve-star',
    dial: 82,
    name: 'RTVE Play Cine',
    shortMark: 'RTVE',
    brandTone: '#2563EB',
    network: 'RTVE Play',
    category: 'cine_series',
    quality: '1080p HD',
    description: 'Cine español e internacional en emisión continua 24/7',
    channels: [
      {
        id: 'rtve-somos-cine',
        label: 'RTVE Somos Cine HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://ztnr.rtve.es/ztnr/1688877.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-euronews-es',
    dial: 83,
    name: 'Euronews Español',
    shortMark: 'EURO',
    brandTone: '#0284C7',
    network: 'Euronews',
    category: 'noticias_deportes',
    quality: '1080p HD',
    description: 'Noticias de Europa y el mundo en directo en español 24 horas',
    channels: [
      {
        id: 'euronews-es-hls',
        label: 'Señal Oficial Euronews ES HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://euronews-euronews-spanish-3-es.samsung.wurl.tv/playlist.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-rakuten-top-movies-es',
    dial: 84,
    name: 'Top Cine España FAST',
    shortMark: 'CINE',
    brandTone: '#9146FF',
    network: 'Rakuten FAST',
    category: 'cine_series',
    quality: '1080p HD',
    description: 'Películas en castellano y estrenos FAST en streaming continuo HD',
    channels: [
      {
        id: 'rakuten-topmovies-es',
        label: 'Señal Oficial Top Movies ES HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://rakuten-topmovies-1-es.samsung.wurl.tv/playlist.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-rakuten-action-es',
    dial: 85,
    name: 'Cine Acción FAST ES',
    shortMark: 'ACT',
    brandTone: '#EA580C',
    network: 'Rakuten FAST',
    category: 'cine_series',
    quality: '1080p HD',
    description: 'Maratón de cine de acción y suspense doblado al castellano 24/7',
    channels: [
      {
        id: 'rakuten-action-es',
        label: 'Señal Oficial Action Movies ES HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://rakuten-actionmovies-1-es.samsung.wurl.tv/playlist.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-love-the-planet-es',
    dial: 86,
    name: 'Planeta Naturaleza ES',
    shortMark: 'NAT',
    brandTone: '#16A34A',
    network: 'Love Nature',
    category: 'documentales',
    quality: '1080p HD',
    description: 'Documentales de vida salvaje, ciencia y océanos en castellano',
    channels: [
      {
        id: 'lovenature-es-fast',
        label: 'Señal Oficial Love Nature ES HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://amg01856-lovenature-lovenaturees-samsunges-0r39n.amagi.tv/playlist.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-fifa-plus-es',
    dial: 87,
    name: 'FIFA+ Fútbol Clásico',
    shortMark: 'FIFA+',
    brandTone: '#0D9488',
    network: 'FIFA+',
    category: 'noticias_deportes',
    quality: '1080p HD',
    description: 'Partidos históricos de Mundiales, documentales y torneos FIFA en directo',
    channels: [
      {
        id: 'fifaplus-es-fast',
        label: 'Señal Oficial FIFA+ ES HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://amg01668-fifa-amg01668c2-samsung-es-2485.playouts.now.amagi.tv/playlist.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-trace-sport-stars',
    dial: 88,
    name: 'Deporte Extremo & Red Bull TV',
    shortMark: 'RBTV',
    brandTone: '#E11D48',
    network: 'Red Bull Media',
    category: 'noticias_deportes',
    quality: '1080p HD',
    description: 'Motor, surf, freestyle, esports y eventos deportivos en directo',
    channels: [
      {
        id: 'redbull-tv-global',
        label: 'Señal Oficial Red Bull TV FHD',
        lang: 'EN',
        quality: '1080p',
        sourceUrl: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
];

function parseM3uText(text: string): Array<{ name: string; logo?: string; group?: string; url: string }> {
  const results: Array<{ name: string; logo?: string; group?: string; url: string }> = [];
  const lines = String(text || '').split(/\r?\n/);
  let currentMeta: { name: string; logo?: string; group?: string } | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF:')) {
      const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
      const groupMatch = line.match(/group-title="([^"]*)"/i);
      const commaIdx = line.lastIndexOf(',');
      const name = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : '';
      currentMeta = {
        name: name.replace(/\s*\(\d+p\)|\s*\[[^\]]+\]/gi, '').trim(),
        logo: logoMatch?.[1] || undefined,
        group: groupMatch?.[1] || undefined,
      };
    } else if (!line.startsWith('#') && currentMeta) {
      if (isPlayableHlsUrl(line)) {
        results.push({
          ...currentMeta,
          url: line,
        });
      }
      currentMeta = null;
    }
  }
  return results;
}

export async function refreshLiveIptvRegistry(force = false): Promise<{
  syncedCount: number;
  extraCount: number;
  lastSyncAt: number;
}> {
  if (!force && lastSyncAt > 0 && Date.now() - lastSyncAt < SYNC_INTERVAL_MS) {
    return {
      syncedCount: syncedUrlMap.size,
      extraCount: discoveredExtraChannels.length,
      lastSyncAt,
    };
  }
  if (syncPromise) {
    await syncPromise;
    return {
      syncedCount: syncedUrlMap.size,
      extraCount: discoveredExtraChannels.length,
      lastSyncAt,
    };
  }

  syncPromise = (async () => {
    const nextMap = new Map<string, { urls: string[]; logo?: string; web?: string }>();
    const extras: LiveIptvChannelEntry[] = [];
    const seenExtraNames = new Set<string>();

    const registerUrl = (rawName: string, url: string, logo?: string, web?: string) => {
      const key = normName(rawName);
      if (!key || !isPlayableHlsUrl(url)) return;
      const existing = nextMap.get(key) || { urls: [], logo, web };
      if (!existing.urls.includes(url)) {
        existing.urls.push(url);
      }
      if (!existing.logo && logo) existing.logo = logo;
      if (!existing.web && web) existing.web = web;
      nextMap.set(key, existing);
    };

    try {
      const tdtResp = await fetch('https://www.tdtchannels.com/lists/tv.json', {
        headers: { 'User-Agent': 'RiffanTV-IPTV/2.0' },
        signal: AbortSignal.timeout(7000),
      });
      if (tdtResp.ok) {
        const json = (await tdtResp.json()) as TdtChannelsJsonRoot;
        const spain = (json.countries || []).find((c) => /spain|espa/i.test(c.name || '')) || json.countries?.[0];
        let extraDial = 90;
        for (const ambit of spain?.ambits || []) {
          const ambitName = String(ambit?.name || '');
          for (const ch of ambit.channels || []) {
            const chName = String(ch?.name || '').trim();
            if (!chName) continue;
            const m3u8Opts = (ch.options || []).filter(
              (o) => o?.url && isPlayableHlsUrl(o.url) && o.geo2 !== 'blocked'
            );
            if (m3u8Opts.length === 0) continue;
            for (const opt of m3u8Opts) {
              registerUrl(chName, String(opt.url), ch.logo, ch.web);
            }

            // Add selected popular regional / theme Spanish channels not in static defaults
            const nKey = normName(chName);
            const isMatchedAlias = Object.values(KNOWN_TDT_ALIASES).some((list) =>
              list.some((a) => nKey === a || nKey.includes(a))
            );
            if (!isMatchedAlias && !seenExtraNames.has(nKey) && extras.length < 28) {
              if (/deporte|cine|noticia|infantil|tv|3cat|telemadrid|galicia|arag|extremadura|asturias|navarra|murcia|castilla/i.test(chName + ' ' + ambitName)) {
                seenExtraNames.add(nKey);
                const slug = nKey.replace(/\s+/g, '-').slice(0, 26);
                extras.push({
                  id: `tdt-live-${slug}`,
                  dial: extraDial++,
                  name: chName,
                  shortMark: chName.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || 'TV',
                  brandTone: '#9146FF',
                  network: ambitName || 'TDT España',
                  category: /deporte|sport/i.test(chName + ambitName)
                    ? 'noticias_deportes'
                    : /cine|movie/i.test(chName + ambitName)
                    ? 'cine_series'
                    : 'infantil_autonomicas',
                  quality: 'HD Live',
                  description: `Señal TDT oficial sincronizada · ${ambitName || 'Directo'}`,
                  logoUrl: ch.logo || undefined,
                  isLiveSynced: true,
                  updatedAt: Date.now(),
                  channels: m3u8Opts.slice(0, 2).map((opt, idx) => ({
                    id: `tdt-live-${slug}-${idx}`,
                    label: `Señal TDTChannels ${idx + 1} (${chName})`,
                    lang: 'ES',
                    quality: opt.res ? `${opt.res}p` : '1080p',
                    sourceUrl: String(opt.url),
                    resolverType: 'tdt_hls' as const,
                    referer: ch.web || undefined,
                  })),
                });
              }
            }
          }
        }
      }
    } catch (err) {
      logger.debug({ err }, 'iptv_tdtchannels_sync_skip');
    }

    try {
      const m3uResp = await fetch('https://iptv-org.github.io/iptv/countries/es.m3u', {
        headers: { 'User-Agent': 'RiffanTV-IPTV/2.0' },
        signal: AbortSignal.timeout(7000),
      });
      if (m3uResp.ok) {
        const text = await m3uResp.text();
        for (const item of parseM3uText(text)) {
          registerUrl(item.name, item.url, item.logo);
        }
      }
    } catch (err) {
      logger.debug({ err }, 'iptv_org_sync_skip');
    }

    if (nextMap.size > 0) {
      syncedUrlMap = nextMap;
    }
    if (extras.length > 0) {
      discoveredExtraChannels = extras;
    }
    lastSyncAt = Date.now();
  })().finally(() => {
    syncPromise = null;
  });

  await syncPromise;
  return {
    syncedCount: syncedUrlMap.size,
    extraCount: discoveredExtraChannels.length,
    lastSyncAt,
  };
}

export function applySyncedStreamsToChannels<T extends LiveIptvChannelEntry>(baseChannels: T[]): T[] {
  const enriched: T[] = baseChannels.map((ch) => {
    const aliasKeys = [normName(ch.name), ...(KNOWN_TDT_ALIASES[ch.id] || [])];
    let match: { urls: string[]; logo?: string; web?: string } | undefined;
    for (const k of aliasKeys) {
      if (k && syncedUrlMap.has(k)) {
        match = syncedUrlMap.get(k);
        break;
      }
    }

    const existingTracks = Array.isArray(ch.channels) ? ch.channels : [];
    // Demote stale private LAN/residential IP relays below verified HTTPS CDNs
    const httpsTracks = existingTracks.filter((tr) => /^https:\/\//i.test(String(tr.sourceUrl || '')));
    const legacyTracks = existingTracks.filter((tr) => !/^https:\/\//i.test(String(tr.sourceUrl || '')));

    const syncedTracks: TrackRecord[] = [];
    if (match?.urls.length) {
      match.urls.slice(0, 2).forEach((u, idx) => {
        const already = existingTracks.some((tr) => tr.sourceUrl === u);
        if (!already) {
          syncedTracks.push({
            id: `${ch.id}-sync-${idx}`,
            label: `Señal Actualizada M3U ${idx + 1} (${ch.name})`,
            lang: 'ES',
            quality: '1080p',
            sourceUrl: u,
            resolverType: 'tdt_hls',
            referer: match?.web,
          });
        }
      });
    }

    const combinedTracks = [...httpsTracks, ...syncedTracks, ...legacyTracks];
    return {
      ...ch,
      logoUrl: ch.logoUrl || match?.logo,
      channels: combinedTracks.length > 0 ? combinedTracks : existingTracks,
    };
  });

  const seenIds = new Set(enriched.map((c) => c.id));
  const seenNames = new Set(enriched.map((c) => normName(c.name)));

  for (const addon of [...CURATED_IPTV_ORG_ADDONS, ...discoveredExtraChannels]) {
    if (seenIds.has(addon.id) || seenNames.has(normName(addon.name))) continue;
    seenIds.add(addon.id);
    seenNames.add(normName(addon.name));
    enriched.push(addon as T);
  }

  return enriched;
}

export function getIptvSyncMeta() {
  return {
    lastSyncAt,
    syncedStreamAliases: syncedUrlMap.size,
    extraSyncedChannels: discoveredExtraChannels.length + CURATED_IPTV_ORG_ADDONS.length,
  };
}
