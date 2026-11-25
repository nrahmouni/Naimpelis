/**
 * @module src/utils/channelQualityRanker
 * @description Shared pure cross-server channel canonicalization, mirror-track merging,
 * resolution/quality scoring, and Spanish TDT + Football priority sorting.
 */
import type {
  ChannelHealthStatus,
  SpanishTdtChannel,
  StreamTrack,
} from '../types';

export interface GenericRankableChannel {
  id: string;
  dial?: number;
  name: string;
  shortMark?: string;
  brandTone?: string;
  logoUrl?: string;
  network?: string;
  category?: string;
  quality?: string;
  description?: string;
  countryCode?: string;
  sourceHub?: string;
  epgChannelId?: string;
  streamId?: string;
  channels: StreamTrack[];
  healthSummary?: {
    bestStatus: ChannelHealthStatus;
    upCount: number;
    totalCount: number;
    bestLatencyMs?: number;
  };
}

const CANONICAL_ALIAS_RULES: Array<[RegExp, string]> = [
  // Spanish National TDT
  [/^(?:tve\s*)?la\s*1(?:\s*tve)?$/i, 'tdt-la1'],
  [/^tve\s*1$/i, 'tdt-la1'],
  [/^(?:tve\s*)?la\s*2(?:\s*tve)?$/i, 'tdt-la2'],
  [/^tve\s*2$/i, 'tdt-la2'],
  [/^antena\s*3$/i, 'tdt-antena3'],
  [/^a3$/i, 'tdt-antena3'],
  [/^cuatro$/i, 'tdt-cuatro'],
  [/^tele\s*5$|^telecinco$/i, 'tdt-telecinco'],
  [/^la\s*sexta$|^lasexta$/i, 'tdt-lasexta'],
  [/^neox$/i, 'tdt-neox'],
  [/^nova$/i, 'tdt-nova'],
  [/^mega$/i, 'tdt-mega'],
  [/^atres\s*series$|^atreseries$|^a3\s*series$/i, 'tdt-atreseries'],
  [/^fdf$|^factoria\s*de\s*ficcion$/i, 'tdt-fdf'],
  [/^divinity$/i, 'tdt-divinity'],
  [/^energy$/i, 'tdt-energy'],
  [/^be\s*mad$|^bemad$/i, 'tdt-bemad'],
  [/^bom\s*cine$/i, 'tdt-bomcine'],
  [/^squirrel(?:\s*cine)?(?:\s*tv)?$/i, 'tdt-squirrel'],
  [/^veo\s*7(?:\s*cine)?$/i, 'tdt-veo7'],
  [/^dmax$|^discovery\s*max$/i, 'tdt-dmax'],
  [/^dkiss$/i, 'tdt-dkiss'],
  [/^ten$/i, 'tdt-ten'],
  [/^trece(?:\s*tv)?$|^13\s*tv$/i, 'tdt-trece'],
  [/^(?:tve\s*)?24\s*h(?:oras)?$|^canal\s*24\s*horas$/i, 'tdt-24h'],
  [/^(?:tve\s*)?teledeporte$|^tdp$/i, 'tdt-teledeporte'],
  [/^real\s*madrid\s*tv$|^rmtv$/i, 'tdt-rmtv'],
  [/^clan(?:\s*rtve|\s*tve)?$/i, 'tdt-clan'],
  [/^boing$/i, 'tdt-boing'],
  [/^canal\s*sur(?:\s*tv|\s*andalucia)?$/i, 'tdt-canalsur'],
  [/^tv\s*3(?:\s*cat)?$|^3cat$/i, 'tdt-3cat'],
  [/^etb\s*1$/i, 'tdt-etb1'],
  [/^etb\s*2$/i, 'tdt-etb2'],
  [/^tv\s*canaria$|^television\s*canaria$/i, 'tdt-tvcanaria'],
  [/^tvg(?:\s*galicia)?$/i, 'tdt-tvg'],

  // Spanish Football & Sports (DAZN / Movistar+)
  [/^dazn\s*laliga(?:\s*1)?$/i, 'dazn-laliga'],
  [/^dazn\s*1$/i, 'dazn-1'],
  [/^dazn\s*2$/i, 'dazn-2'],
  [/^dazn\s*3$/i, 'dazn-3'],
  [/^dazn\s*4$/i, 'dazn-4'],
  [/^dazn\s*f1$/i, 'dazn-f1'],
  [/^(?:movistar|m\+)\s*plus\+?$/i, 'mplus-canal'],
  [/^movistar\+$/i, 'mplus-canal'],
  [/^(?:movistar|m\+)\s*vamos$/i, 'mplus-vamos'],
  [/^vamos(?:\s*por\s*m\+)?$/i, 'mplus-vamos'],
  [/^(?:movistar|m\+)\s*laliga(?:\s*tv)?$/i, 'mplus-laliga'],
  [/^laliga\s*tv\s*por\s*m\+$/i, 'mplus-laliga'],
  [/^laliga\s*(?:tv\s*)?hypermotion$/i, 'mplus-hypermotion'],
  [/^(?:movistar|m\+)\s*liga\s*de\s*campeones$/i, 'mplus-champions'],
  [/^liga\s*de\s*campeones(?:\s*por\s*m\+)?$/i, 'mplus-champions'],
  [/^(?:movistar|m\+)\s*deportes(?:\s*1)?$/i, 'mplus-deportes'],
  [/^(?:movistar|m\+)\s*deportes\s*2$/i, 'mplus-deportes2'],
  [/^(?:movistar|m\+)\s*golf$/i, 'mplus-golf'],
  [/^eurosport\s*1(?:\s*es)?$/i, 'mplus-eurosport1'],
  [/^eurosport\s*2(?:\s*es)?$/i, 'mplus-eurosport2'],
];

const NOISY_PREFIX_RE =
  /^(?:\[?\s*(?:ES|ESP|SPAIN|ESPAÑA|LAT|MX|AR|UK|US|USA|FR|DE|IT|PT|EU|NL|VIP|RAW|BACKUP)\s*\]?\s*[:|\-/·]+\s*)+/i;
const NOISY_SUFFIX_RE =
  /(?:\s*(?:\(|\[)?\b(?:4K|UHD|FHD|HD|SD|HEVC|H\.?265|H\.?264|AVC|RAW|VIP|60FPS|50FPS|1080P?|720P?|576P?|480P?|BACKUP|RESPALDO|OPCION\s*\d*|OPT\s*\d*|SERVER\s*\d*)\b(?:\)|\])?)+$/gi;

export function stripChannelNoise(rawName: string): string {
  let clean = String(rawName || '')
    .replace(/⁴ᴷ|⁴ᵏ/g, ' 4K ')
    .replace(/ᶠᴴᴰ/gi, ' FHD ')
    .replace(/ᴴᴰ/gi, ' HD ')
    .replace(/＋/g, '+')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  clean = clean.replace(NOISY_PREFIX_RE, '').trim();
  clean = clean.replace(/[|•·]/g, ' ').replace(/\s+/g, ' ').trim();
  clean = clean.replace(NOISY_PREFIX_RE, '').trim();
  for (let i = 0; i < 3; i++) {
    const next = clean.replace(NOISY_SUFFIX_RE, '').trim();
    if (next === clean) break;
    clean = next;
  }
  return clean.replace(/\s+/g, ' ').trim();
}

export function resolveCanonicalChannelKey(
  ch: Pick<GenericRankableChannel, 'id' | 'name' | 'network' | 'category' | 'countryCode'>
): string {
  const id = String(ch.id || '').trim();
  if (
    id &&
    !id.startsWith('xtream-') &&
    !id.startsWith('octopus-') &&
    !id.startsWith('belix-') &&
    !id.startsWith('rbtv-')
  ) {
    return id;
  }

  const cleaned = stripChannelNoise(ch.name);
  const netCtx = `${ch.network || ''} ${ch.name || ''}`;
  const looksSpanish =
    /\b(?:es|esp|spain|espana|tdt|movistar|dazn|atresmedia|mediaset|rtve|laliga|hypermotion|campeones)\b/i.test(
      netCtx
    ) || String(ch.countryCode || '').toLowerCase() === 'es';

  for (const [pattern, canonicalId] of CANONICAL_ALIAS_RULES) {
    if (pattern.test(cleaned)) {
      if (
        (canonicalId.startsWith('dazn-') ||
          canonicalId.startsWith('mplus-') ||
          canonicalId === 'tdt-la1' ||
          canonicalId === 'tdt-ten') &&
        /\b(?:uk|pt|portugal|de|germany|it|italy|fr|france|us|usa|ar|arabic|br)\b/i.test(
          ch.name
        ) &&
        !looksSpanish
      ) {
        continue;
      }
      return canonicalId;
    }
  }

  const slug = cleaned
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) return id || 'unknown';

  const langHint = /\b(?:uk|en|us)\b/i.test(ch.name)
    ? ':en'
    : /\b(?:ar|arabic)\b/i.test(ch.name)
    ? ':ar'
    : /\b(?:fr)\b/i.test(ch.name)
    ? ':fr'
    : '';
  return `norm:${slug}${langHint}`;
}

export function inferStreamQualityTag(
  explicitQuality?: string,
  label?: string,
  sourceUrl?: string
): { label: string; tier: number } {
  const text = `${explicitQuality || ''} ${label || ''} ${sourceUrl || ''}`
    .replace(/⁴ᴷ|⁴ᵏ/g, ' 4K ')
    .toLowerCase();
  const isHevc = /\b(?:hevc|h\.?265|x265)\b/.test(text);
  if (/\b(?:4k|uhd|2160p?)\b/.test(text)) {
    return { label: '4K UHD', tier: isHevc ? 3 : 0 };
  }
  if (/\b(?:fhd|1080p?|full\s*hd)\b/.test(text)) {
    return { label: '1080p FHD', tier: isHevc ? 3 : 1 };
  }
  if (/\b(?:576p?|480p?|360p?|sd|lq)\b/.test(text)) {
    return { label: 'SD', tier: 4 };
  }
  if (/\b(?:720p?|hd)\b/.test(text)) {
    return { label: 'HD', tier: isHevc ? 3 : 2 };
  }
  if (/^\/api\/(xtream\/stream|stream|belix\/stream)/i.test(String(sourceUrl || ''))) {
    return { label: 'HD Live', tier: 2 };
  }
  return { label: 'HD', tier: 2 };
}

function normalizeUrlForMerge(url: string): string {
  return String(url || '')
    .trim()
    .replace(/[?&]profile=(hd|fast)\b/gi, '');
}

const FLAGSHIP_PRIORITY: Record<string, number> = {
  'tdt-la1': 1,
  'tdt-la2': 2,
  'tdt-antena3': 3,
  'tdt-cuatro': 4,
  'tdt-telecinco': 5,
  'tdt-lasexta': 6,
  'mplus-laliga': 7,
  'dazn-laliga': 8,
  'mplus-champions': 9,
  'mplus-canal': 10,
  'dazn-f1': 11,
  'dazn-1': 12,
  'dazn-2': 13,
  'mplus-vamos': 14,
  'mplus-hypermotion': 15,
  'dazn-3': 16,
  'dazn-4': 17,
  'tdt-teledeporte': 18,
  'tdt-rmtv': 19,
  'tdt-24h': 20,
  'tdt-neox': 21,
  'tdt-nova': 22,
  'tdt-mega': 23,
  'tdt-atreseries': 24,
  'tdt-fdf': 25,
  'tdt-divinity': 26,
  'tdt-energy': 27,
  'tdt-bemad': 28,
  'tdt-bomcine': 29,
  'tdt-squirrel': 30,
  'tdt-veo7': 31,
  'tdt-dmax': 32,
  'tdt-dkiss': 33,
  'tdt-ten': 34,
  'tdt-trece': 35,
  'tdt-clan': 36,
  'tdt-boing': 37,
  'tdt-canalsur': 38,
  'tdt-3cat': 39,
};

export function getTvBrowsePriorityRank(ch: GenericRankableChannel): number {
  const id = String(ch.id || '').toLowerCase();
  if (FLAGSHIP_PRIORITY[id]) {
    return FLAGSHIP_PRIORITY[id];
  }

  const cat = String(ch.category || '').toLowerCase();
  const hay = `${ch.name || ''} ${ch.network || ''}`.toLowerCase();
  const isEs = String(ch.countryCode || '').toUpperCase() === 'ES';
  const statusBonus =
    ch.healthSummary?.bestStatus === 'up'
      ? -15
      : ch.healthSummary?.bestStatus === 'down'
      ? 200
      : 0;
  const esBonus = isEs ? -10 : 0;

  if (cat === 'generalistas') return 45 + (ch.dial || 30) + statusBonus + esBonus;
  if (cat === 'dazn') return 80 + (ch.dial || 30) + statusBonus + esBonus;
  if (cat === 'movistar') return 110 + (ch.dial || 30) + statusBonus + esBonus;
  if (cat === 'noticias_deportes') return 160 + (ch.dial || 30) + statusBonus + esBonus;
  if (cat === 'entretenimiento') return 200 + (ch.dial || 30) + statusBonus + esBonus;
  if (cat === 'cine_series') return 240 + (ch.dial || 30) + statusBonus + esBonus;
  if (cat === 'documentales') return 280 + (ch.dial || 30) + statusBonus + esBonus;
  if (cat === 'infantil_autonomicas') return 320 + (ch.dial || 30) + statusBonus + esBonus;

  if (cat === 'belix_live') {
    const isFootballOrSpain =
      isEs ||
      /\b(?:espana|espaa|spain|tdt|laliga|movistar|m\+|dazn|champions|campeones|futbol|deporte|hypermotion|vamos)\b/i.test(
        hay
      );
    if (isFootballOrSpain) return 360 + statusBonus + esBonus;
    return 520 + statusBonus + Math.min(90, ch.dial || 50);
  }

  if (cat === 'rbtv_sports' || cat === 'uk_sports' || cat === 'beinsports') {
    return 430 + statusBonus;
  }
  if (cat === 'espn' || cat === 'dsports' || cat === 'tnt_space') {
    return 470 + statusBonus;
  }
  if (cat === 'bein_arabic' || cat === 'china_football') {
    return 500 + statusBonus;
  }

  return 620 + statusBonus + Math.min(200, ch.dial || 100);
}

export function mergeAndDeduplicateChannels<T extends GenericRankableChannel>(
  channels: T[]
): T[] {
  const byKey = new Map<
    string,
    {
      channel: T;
      trackUrls: Set<string>;
      tracks: StreamTrack[];
    }
  >();

  for (const ch of channels) {
    if (!ch || !ch.id) continue;
    const key = resolveCanonicalChannelKey(ch);
    const existing = byKey.get(key);

    const normalizedTracks = (ch.channels || []).map((tr) => {
      const inferred = inferStreamQualityTag(tr.quality, `${tr.label} ${ch.name}`, tr.sourceUrl);
      return {
        ...tr,
        quality: tr.quality && tr.quality !== 'HD' ? tr.quality : inferred.label,
      };
    });

    if (!existing) {
      const urlSet = new Set<string>();
      const uniqueTracks: StreamTrack[] = [];
      for (const tr of normalizedTracks) {
        const uKey = normalizeUrlForMerge(tr.sourceUrl);
        if (!uKey || urlSet.has(uKey)) continue;
        urlSet.add(uKey);
        uniqueTracks.push(tr);
      }
      byKey.set(key, {
        channel: {
          ...ch,
          channels: uniqueTracks,
        },
        trackUrls: urlSet,
        tracks: uniqueTracks,
      });
      continue;
    }

    for (const tr of normalizedTracks) {
      const uKey = normalizeUrlForMerge(tr.sourceUrl);
      if (!uKey || existing.trackUrls.has(uKey)) continue;
      existing.trackUrls.add(uKey);
      existing.tracks.push(tr);
    }

    // Prefer better logoUrl or EPG ID if base lacked them
    if (!existing.channel.logoUrl && ch.logoUrl) {
      existing.channel = { ...existing.channel, logoUrl: ch.logoUrl };
    }
    if (!existing.channel.epgChannelId && ch.epgChannelId) {
      existing.channel = { ...existing.channel, epgChannelId: ch.epgChannelId };
    }
    existing.channel = {
      ...existing.channel,
      channels: existing.tracks,
    };
  }

  return Array.from(byKey.values()).map((entry) => entry.channel);
}

export function rankClientChannels<T extends SpanishTdtChannel>(channels: T[]): T[] {
  const merged = mergeAndDeduplicateChannels(channels);
  return merged.sort((a, b) => {
    const rankDiff = getTvBrowsePriorityRank(a) - getTvBrowsePriorityRank(b);
    if (rankDiff !== 0) return rankDiff;
    const sigDiff = (b.channels?.length || 0) - (a.channels?.length || 0);
    if (sigDiff !== 0) return sigDiff;
    return (a.dial || 999) - (b.dial || 999);
  });
}
