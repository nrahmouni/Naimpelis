import { curlGetText, type TrackRecord } from '../extractors/httpHelpers.ts';
import { logger } from '../utils/logger.ts';
import { isAnyBelixConnected } from './belix/belixXtreamClient.ts';

async function fetchSyncTextSafe(url: string, timeoutMs = 7000): Promise<string> {
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'RiffanTV-IPTV/2.0' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (resp.ok) {
      const txt = await resp.text();
      if (txt) return txt;
    }
  } catch {
    // fallback to IPv4 curl on Happy Eyeballs IPv6 timeout
  }
  const fb = await curlGetText(
    url,
    { 'User-Agent': 'RiffanTV-IPTV/2.0' },
    Math.max(4, Math.ceil(timeoutMs / 1000)),
    true,
    true
  ).catch(() => ({ text: '' }));
  return fb.text || '';
}

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
  if (/\[(IP|UA|DEVICE_ID|MAC)\]/i.test(url)) return false;
  if (
    /ztnr\.rtve\.es|interactvty\.pro|c21livecloud\.com|voxel-tv|90\.170\.214\.40|185\.47\.212\.25/i.test(
      url
    )
  ) {
    return false;
  }
  if (/\.mpd(\?|$|#)/i.test(url)) return false;
  if (/youtube\.com|youtu\.be|twitch\.tv|dailymotion\.com|vimeo\.com/i.test(url)) return false;
  return /\.m3u8(\?|$|#)|\/hls\/|\/manifest/i.test(url);
}

const KNOWN_TDT_ALIASES: Record<string, string[]> = {
  'tdt-la1': ['la 1', 'tve la 1', 'la 1 uhd'],
  'tdt-la2': ['la 2', 'tve la 2'],
  'tdt-24h': ['24h', 'canal 24 horas', '24 horas'],
  'tdt-teledeporte': ['teledeporte', 'tdp'],
  'tdt-clan': ['clan', 'clan tv'],
  'tdt-antena3': ['antena 3', 'antena 3 hd', 'antena3'],
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
  'tdt-paramount': ['paramount network', 'paramount', 'squirrel', 'squirrel tv'],
  'tdt-squirrel': ['squirrel', 'squirrel 2', 'squirrel2', 'squirrel tv'],
  'tdt-veo7': ['veo 7', 'veo7'],
  'tdt-bomcine': ['bom cine', 'bom'],
  'tdt-dmax': ['dmax'],
  'tdt-dkiss': ['dkiss'],
  'tdt-ten': ['ten'],
  'tdt-trece': ['trece', '13tv'],
  'tdt-gol': ['gol play', 'gol'],
  'tdt-rmtv': ['real madrid tv', 'rmtv'],
  'tdt-3cat': ['tv3', '3cat', 'tv3cat'],
  'cat-tv3-live': ['tv3', '3cat', 'tv3cat'],
  'cat-324-live': ['324', '3 24', '324cat'],
  'cat-esport3-live': ['esport3', 'esport 3'],
  'cat-sx3-live': ['sx3', 'super3'],
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
      const tdtText = await fetchSyncTextSafe('https://www.tdtchannels.com/lists/tv.json', 8000);
      if (tdtText) {
        const json = JSON.parse(tdtText) as TdtChannelsJsonRoot;
        const spain = (json.countries || []).find((c) => /spain|espa/i.test(c.name || '')) || json.countries?.[0];
        let extraDial = 90;
        for (const ambit of spain?.ambits || []) {
          const ambitName = String(ambit?.name || '');
          for (const ch of ambit.channels || []) {
            const chName = String(ch?.name || '').trim();
            if (!chName) continue;
            const m3u8Opts = (ch.options || [])
              .filter((o) => {
                if (!o?.url || !isPlayableHlsUrl(o.url) || o.geo2 === 'blocked') return false;
                const resNum = Number(String(o.res || '').replace(/[^\d]/g, '') || 0);
                if (resNum > 0 && resNum < 540) return false;
                return true;
              })
              .sort((a, b) => {
                const ra = Number(String(a?.res || '').replace(/[^\d]/g, '') || 0);
                const rb = Number(String(b?.res || '').replace(/[^\d]/g, '') || 0);
                return rb - ra;
              });
            if (m3u8Opts.length === 0) continue;
            for (const opt of m3u8Opts) {
              registerUrl(chName, String(opt.url), ch.logo, ch.web);
            }

            // Add selected popular regional / theme Spanish channels not in static defaults
            const nKey = normName(chName);
            const isMatchedAlias = Object.values(KNOWN_TDT_ALIASES).some((list) =>
              list.some((a) => nKey === a || nKey.includes(a))
            );
            const hasOnlyGeoOrDeadExtra = m3u8Opts.every((o) =>
              /rtvelivestream\.rtve\.es\/(?:rtvesec|eventual)\/|energeek/i.test(String(o.url || ''))
            );
            if (!isMatchedAlias && !hasOnlyGeoOrDeadExtra && !seenExtraNames.has(nKey) && extras.length < 28) {
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
      const text = await fetchSyncTextSafe('https://iptv-org.github.io/iptv/countries/es.m3u', 8000);
      if (text) {
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

function getEnvCustomTdtTracks(channelId: string): TrackRecord[] {
  const custom: TrackRecord[] = [];
  if (channelId === 'tdt-antena3') {
    const a3Backup = String(
      process.env.ANTENA3_BACKUP_M3U8 || process.env.TDT_ANTENA3_BACKUP_URL || ''
    ).trim();
    if (/^https?:\/\//i.test(a3Backup)) {
      custom.push({
        id: 'tdt-antena3-env-backup',
        label: 'Señal Privada HD (España / VPS)',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: a3Backup,
        resolverType: 'tdt_hls',
      });
    }
  }
  const jsonRaw = String(process.env.TDT_CUSTOM_STREAMS_JSON || '').trim();
  if (jsonRaw) {
    try {
      const parsed = JSON.parse(jsonRaw) as Record<string, string | string[]>;
      const val = parsed?.[channelId];
      const list = Array.isArray(val) ? val : typeof val === 'string' ? [val] : [];
      list.forEach((u, idx) => {
        const clean = String(u || '').trim();
        if (/^https?:\/\//i.test(clean)) {
          custom.push({
            id: `${channelId}-env-custom-${idx}`,
            label: `Cabecera Privada ${idx + 1} (HD)`,
            lang: 'ES',
            quality: '1080p',
            sourceUrl: clean,
            resolverType: 'tdt_hls',
          });
        }
      });
    } catch {
      // ignore malformed TDT_CUSTOM_STREAMS_JSON
    }
  }
  return custom;
}

export function applySyncedStreamsToChannels<T extends LiveIptvChannelEntry>(
  baseChannels: T[],
  belixConnectedOverride?: boolean
): T[] {
  const belixConnected =
    typeof belixConnectedOverride === 'boolean'
      ? belixConnectedOverride
      : isAnyBelixConnected();
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
    const envCustomTracks = getEnvCustomTdtTracks(ch.id);
    const activeExisting = belixConnected
      ? existingTracks
      : existingTracks.filter((tr) => !String(tr.sourceUrl || '').startsWith('/api/belix/stream/'));
    const belixTracks = belixConnected
      ? []
      : existingTracks.filter((tr) => String(tr.sourceUrl || '').startsWith('/api/belix/stream/'));

    const syncedTracks: TrackRecord[] = [];
    if (match?.urls.length) {
      match.urls.slice(0, 2).forEach((u, idx) => {
        const already = existingTracks.some((tr) => tr.sourceUrl === u);
        if (!already) {
          syncedTracks.push({
            id: `${ch.id}-sync-${idx}`,
            label: `Señal Actualizada M3U ${idx + 1} (${ch.name})`,
            lang: 'ES',
            quality: /azotosolutions\.com/i.test(u) ? '576p' : '1080p',
            sourceUrl: u,
            resolverType: 'tdt_hls',
            referer: match?.web,
          });
        }
      });
    }

    const combinedTracks =
      envCustomTracks.length > 0 || activeExisting.length > 0 || syncedTracks.length > 0
        ? [...envCustomTracks, ...activeExisting, ...syncedTracks]
        : belixTracks;
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
