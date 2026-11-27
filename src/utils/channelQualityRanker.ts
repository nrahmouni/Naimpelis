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
  // Spanish National TDT & Atresmedia / Mediaset / RTVE
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
  [/^(?:tve\s*)?24\s*h(?:oras)?$|^canal\s*24\s*horas$|^24\s*horas$/i, 'tdt-24h'],
  [/^(?:tve\s*)?teledeporte$|^tdp$/i, 'tdt-teledeporte'],
  [/^real\s*madrid(?:\s*tv)?$|^rmtv$/i, 'tdt-rmtv'],
  [/^clan(?:\s*tv|\s*rtve|\s*tve)?$/i, 'tdt-clan'],
  [/^boing$/i, 'tdt-boing'],
  [/^canal\s*sur(?:\s*tv|\s*andalucia)?$/i, 'tdt-canalsur'],
  [/^tv\s*3(?:\s*cat)?$|^3cat$/i, 'tdt-3cat'],
  [/^telemadrid$|^tele\s*madrid$/i, 'tdt-telemadrid'],
  [/^etb\s*1$/i, 'tdt-etb1'],
  [/^etb\s*2$/i, 'tdt-etb2'],
  [/^tv\s*canaria$|^television\s*canaria$/i, 'tdt-tvcanaria'],
  [/^tvg(?:\s*galicia)?$|^tv\s*galicia$/i, 'tdt-tvg'],

  // Spanish Football & Sports (DAZN / Movistar+)
  [/^dazn\s*la\s*liga(?:\s*1)?$/i, 'dazn-laliga'],
  [/^dazn\s*1$/i, 'dazn-1'],
  [/^dazn\s*2$/i, 'dazn-2'],
  [/^dazn\s*3$/i, 'dazn-3'],
  [/^dazn\s*4$/i, 'dazn-4'],
  [/^dazn\s*(?:m\.?\s*)?f(?:ormula\s*)?1$/i, 'dazn-f1'],
  [/^(?:movistar|m[+.]?)\s*plus\+?(?:\s*1)?$|^#0$/i, 'mplus-canal'],
  [/^(?:movistar|m[+.]?)\s*vamos$|^vamos(?:\s*por\s*m\+)?$/i, 'mplus-vamos'],
  [/^(?:movistar|m[+.]?)\s*la\s*liga(?:\s*tv)?$|^la\s*liga\s*tv\s*por\s*m\+$|^la\s*liga\s*por\s*m\+$/i, 'mplus-laliga'],
  [/^la\s*liga\s*(?:tv\s*)?hypermotion(?:\s*1)?$/i, 'mplus-hypermotion'],
  [/^(?:movistar|m[+.]?)\s*(?:liga\s*(?:de\s*)?campeones|l\.?\s*campeones)$|^liga\s*de\s*campeones(?:\s*por\s*m\+)?$/i, 'mplus-champions'],
  [/^(?:movistar|m[+.]?)\s*deportes(?:\s*1)?$/i, 'mplus-deportes'],
  [/^(?:movistar|m[+.]?)\s*deportes\s*2$/i, 'mplus-deportes2'],
  [/^(?:movistar|m[+.]?)\s*golf$/i, 'mplus-golf'],
  [/^(?:dazn\s*)?eurosport\s*1(?:\s*es)?$/i, 'mplus-eurosport1'],
  [/^(?:dazn\s*)?eurosport\s*2(?:\s*es)?$/i, 'mplus-eurosport2'],

  // Spanish & International Cinema, Docs & Sports cross-server aliases
  [/^axn(?:\s*es)?$/i, 'cine-axn'],
  [/^axn\s*(?:movies?|white)$/i, 'cine-axn-movies'],
  [/^warner(?:\s*tv)?$/i, 'cine-warner'],
  [/^amc(?:\s*es)?$/i, 'cine-amc'],
  [/^calle\s*13$/i, 'cine-calle13'],
  [/^star(?:\s*channel)?$|^fox(?:\s*es)?$/i, 'cine-star'],
  [/^hollywood$|^canal\s*hollywood$/i, 'cine-hollywood'],
  [/^tcm$/i, 'cine-tcm'],
  [/^syfy$/i, 'cine-syfy'],
  [/^comedy\s*central$/i, 'cine-comedy-central'],
  [/^nat(?:l|ional)?\s*geographic$|^nat\s*geo$/i, 'doc-natgeo'],
  [/^nat\s*geo\s*wild$/i, 'doc-natgeo-wild'],
  [/^discovery(?:\s*channel)?$/i, 'doc-discovery'],
  [/^historia$|^canal\s*historia$/i, 'doc-historia'],
  [/^bein\s*sports?\s*1$/i, 'intl-bein1'],
  [/^bein\s*sports?\s*2$/i, 'intl-bein2'],
  [/^bein\s*sports?\s*3$/i, 'intl-bein3'],
  [/^espn\s*1$|^espn$/i, 'intl-espn1'],
  [/^espn\s*2$/i, 'intl-espn2'],
  [/^tnt\s*sports?\s*1$/i, 'intl-tntsports1'],
  [/^sky\s*sports?\s*main\s*event$/i, 'intl-skysports-main'],
];

const NOISY_PREFIX_RE =
  /^(?:[|•·\s]+|\[?\s*(?:ES-[A-Z0-9]+|P-ES|VIP\s*ES|TIVIF?Y(?:\s*ES)?|ES|ESP|SPAIN|ESPAÑA|LAT|MX|AR|ARB|UK|US|USA|FR|DE(?:-[A-Z0-9]+)?|GER|IT|ITA|PT|POR|EU|NL|CAT|VIP|RAW|BACKUP|4K|UHD|FHD|HD)\s*\]?\s*[:|\-/·•]+\s*)+/i;
const NOISY_SUFFIX_RE =
  /(?:\s*(?:\(|\[)?\b(?:4K|UHD|FHD|HD|SD|HEVC|H\.?265|H\.?264|AVC|RAW|VIP|60FPS|50FPS|1080P?|720P?|576P?|480P?|BACKUP|RESPALDO|OPCION\s*\d*|OPT\s*\d*|SERVER\s*\d*)\b(?:\)|\])?|\s+\[[A-Z0-9]{1,3}\]|\s+\([A-Z0-9]{1,3}\))+$/gi;

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

  const normRawName = String(ch.name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const hasExplicitForeignTag =
    /^(?:\|?\s*(?:UK|US|USA|FR|DE(?:-[A-Z0-9]+)?|GER|IT|ITA|PT|POR|AR|ARB|ARG|LAT|LA|MX|COL|CHL|PE|CH|SW|NL|PL|RO|GR|BG|RS|MK|TR|RU|FI|NO|SE|DK|BE|AT|AL|IND|BR)\s*[:|\-/])|\b(?:1ere|rsi\s+la\s*2)\b/i.test(
      normRawName
    );

  for (const [pattern, canonicalId] of CANONICAL_ALIAS_RULES) {
    if (pattern.test(cleaned)) {
      if (
        hasExplicitForeignTag &&
        (canonicalId.startsWith('tdt-') ||
          canonicalId.startsWith('dazn-') ||
          canonicalId.startsWith('mplus-'))
      ) {
        continue;
      }
      if (
        (canonicalId.startsWith('dazn-') ||
          canonicalId.startsWith('mplus-') ||
          canonicalId.startsWith('cine-') ||
          canonicalId.startsWith('doc-') ||
          canonicalId === 'tdt-la1' ||
          canonicalId === 'tdt-la2' ||
          canonicalId === 'tdt-telecinco' ||
          canonicalId === 'tdt-trece' ||
          canonicalId === 'tdt-ten') &&
        /\b(?:uk|pt|portugal|de|germany|it|italy|fr|france|us|usa|ar|arabic|br|lat|arg|ch|sw|swiss)\b/i.test(
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

  const langHint = /\b(?:uk|en|us|usa)\b/i.test(ch.name)
    ? ':en'
    : /\b(?:ar|arabic|arb)\b/i.test(ch.name)
    ? ':ar'
    : /\b(?:fr|france)\b/i.test(ch.name)
    ? ':fr'
    : /\b(?:pt|br|portugal)\b/i.test(ch.name)
    ? ':pt'
    : /\b(?:it|italy)\b/i.test(ch.name)
    ? ':it'
    : /\b(?:de|ger|germany)\b/i.test(ch.name)
    ? ':de'
    : /\b(?:lat|latino|mx|arg)\b/i.test(ch.name)
    ? ':lat'
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
    .replace(/ᶠᴴᴰ/gi, ' FHD ')
    .replace(/ᴴᴰ/gi, ' HD ')
    .toLowerCase();
  const isHevc = /\b(?:hevc|h\.?265|x265)\b/.test(text);
  if (/\b(?:4k|uhd|2160p?)\b/.test(text)) {
    return { label: '4K UHD', tier: isHevc ? 2.5 : 0 };
  }
  if (/\b(?:fhd|1080p?|full\s*hd)\b/.test(text)) {
    return { label: '1080p FHD', tier: isHevc ? 2.8 : 1 };
  }
  if (/\b(?:576p?|480p?|360p?|sd|lq)\b/.test(text)) {
    return { label: 'SD', tier: 4 };
  }
  if (/\b(?:720p?|hd)\b/.test(text)) {
    return { label: 'HD', tier: isHevc ? 3.2 : 2 };
  }
  if (/^\/api\/(xtream\/stream|providers\/stream|stream|belix\/stream)/i.test(String(sourceUrl || ''))) {
    return { label: '1080p FHD', tier: 1.5 };
  }
  return { label: 'HD', tier: 2 };
}

export function normalizeLiveTrackLang(rawLang?: string, label?: string, countryCode?: string): string {
  const raw = String(rawLang || '').trim().toUpperCase();
  const hay = `${label || ''}`.toLowerCase();
  if (raw === 'ES' || raw === 'ESP' || raw === 'CAST') return 'ES';
  if (raw === 'LAT' || raw === 'LA' || raw === 'MX') return 'LAT';
  if (raw === 'EN' || raw === 'ENG' || raw === 'UK' || raw === 'US') return 'EN';
  if (raw === 'CAT' || raw === 'CA') return 'CAT';
  if (raw === 'AR' || raw === 'ARB') return 'AR';
  if (raw === 'FR') return 'FR';
  if (raw === 'PT' || raw === 'BR') return 'PT';
  if (raw === 'IT') return 'IT';
  if (raw === 'DE' || raw === 'GER') return 'DE';
  if (raw === 'VOSE') return 'VOSE';
  if (/\b(?:es|esp|spain|espana|castellano)\b/.test(hay)) return 'ES';
  if (/\b(?:lat|latino)\b/.test(hay)) return 'LAT';
  if (/\b(?:uk|us|usa|eng|english)\b/.test(hay)) return 'EN';
  if (String(countryCode || '').toUpperCase() === 'ES') return 'ES';
  return raw || 'ES';
}

function isDanaDirectTrack(tr: StreamTrack): boolean {
  const pid = String((tr as { providerId?: string }).providerId || '').toLowerCase();
  if (pid === 'dana4k') return true;
  const u = String(tr.sourceUrl || '').toLowerCase();
  if (u.indexOf('provider=dana4k') !== -1) return true;
  const lbl = String(tr.label || '').toLowerCase();
  return lbl.indexOf('dana 4k') !== -1;
}

function liveTrackSortScore(tr: StreamTrack, preferSpanish: boolean): number {
  const status = tr.health?.status ?? 'unknown';
  const statusRank = status === 'down' ? 3 : status === 'degraded' ? 2 : 0;
  const upBonus = status === 'up' ? -600 : 0;
  const lang = normalizeLiveTrackLang(tr.lang, tr.label);
  const langRank = preferSpanish
    ? lang === 'ES'
      ? 0
      : lang === 'CAT'
      ? 1
      : lang === 'LAT'
      ? 2
      : lang === 'EN'
      ? 3
      : 4
    : 0;
  const q = inferStreamQualityTag(tr.quality, tr.label, tr.sourceUrl);
  // Keep a small tie-breaker only for unprobed Dana 4K tracks; never override faster verified signals
  const danaTieBreak =
    preferSpanish && status === 'unknown' && lang === 'ES' && isDanaDirectTrack(tr) && q.tier < 2.5
      ? -25
      : 0;
  const srcStr = String(tr.sourceUrl || '');
  const isResidentialDvb = srcStr.includes('90.163.85.113:8093');
  const directApiBonus = /^\/api\/(?:stream\?|providers\/stream\/)/i.test(srcStr) ? -40 : 0;
  const latMs = typeof tr.health?.latencyMs === 'number' ? Math.min(9999, tr.health.latencyMs) : 1400;
  const qualityLatencyWeight =
    q.tier >= 2.5 ? 3500 + Math.round(q.tier * 200) + latMs : Math.round(q.tier * 110) + latMs;
  return (
    statusRank * 100000 +
    (isResidentialDvb ? 65000 : 0) +
    langRank * 10000 +
    upBonus +
    danaTieBreak +
    directApiBonus +
    qualityLatencyWeight
  );
}

function normalizeUrlForMerge(url: string): string {
  const clean = String(url || '')
    .trim()
    .replace(/[?&]profile=(hd|fast)\b/gi, '');
  if (/^\/api\/stream\?/i.test(clean)) {
    const q = clean.split('?')[1] || '';
    const provMatch = q.match(/(?:^|&)provider=([^&]+)/i);
    const idMatch = q.match(/(?:^|&)id=([^&]+)/i);
    if (idMatch && idMatch[1]) {
      const prov = (provMatch?.[1] || 'primary').toLowerCase();
      return `xtream-direct:${prov}:${decodeURIComponent(idMatch[1])}`;
    }
  }
  const provStreamMatch = clean.match(/^\/api\/providers\/stream\/([^/]+)\/live\/([^.?/]+)(?:\.[^?]*)?(?:\?.*)?$/i);
  if (provStreamMatch) {
    return `xtream-direct:${decodeURIComponent(provStreamMatch[1]).toLowerCase()}:${decodeURIComponent(provStreamMatch[2])}`;
  }
  const xtreamMatch = clean.match(/^\/api\/xtream\/stream\/([^.?/]+)(?:\.m3u8)?(?:\?(.*))?$/i);
  if (xtreamMatch) {
    const q = xtreamMatch[2] || '';
    const provMatch = q.match(/(?:^|&)provider=([^&]+)/i);
    const prov = (provMatch?.[1] || 'primary').toLowerCase();
    return `xtream-direct:${prov}:${xtreamMatch[1]}`;
  }
  return clean;
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
  const isEs =
    String(ch.countryCode || '').toUpperCase() === 'ES' ||
    (ch.channels || []).some((tr) => normalizeLiveTrackLang(tr.lang, tr.label) === 'ES');
  const statusBonus =
    ch.healthSummary?.bestStatus === 'up'
      ? -18
      : ch.healthSummary?.bestStatus === 'down'
      ? 220
      : 0;
  const esBonus = isEs ? -14 : 0;
  const bestQ = inferStreamQualityTag(ch.quality, ch.channels?.[0]?.quality, ch.channels?.[0]?.sourceUrl);
  const qualityBonus = bestQ.tier === 0 ? -12 : bestQ.tier <= 1 ? -6 : bestQ.tier >= 4 ? 12 : 0;
  const mirrorBonus = (ch.channels?.length || 0) >= 3 ? -4 : 0;
  const totalBonus = statusBonus + esBonus + qualityBonus + mirrorBonus;

  if (cat === 'generalistas') return 45 + (ch.dial || 30) + totalBonus;
  if (cat === 'dazn') return 80 + (ch.dial || 30) + totalBonus;
  if (cat === 'movistar') return 110 + (ch.dial || 30) + totalBonus;
  if (cat === 'noticias_deportes') return 160 + (ch.dial || 30) + totalBonus;
  if (cat === 'entretenimiento') return 200 + (ch.dial || 30) + totalBonus;
  if (cat === 'cine_series') return 240 + (ch.dial || 30) + totalBonus;
  if (cat === 'documentales') return 280 + (ch.dial || 30) + totalBonus;
  if (cat === 'infantil_autonomicas') return 320 + (ch.dial || 30) + totalBonus;

  if (cat === 'belix_live') {
    const isFootballOrSpain =
      isEs ||
      /\b(?:espana|espaa|spain|tdt|laliga|movistar|m\+|dazn|champions|campeones|futbol|deporte|hypermotion|vamos)\b/i.test(
        hay
      );
    if (isFootballOrSpain) return 340 + totalBonus;
    return 510 + statusBonus + qualityBonus + Math.min(90, ch.dial || 50);
  }

  if (cat === 'rbtv_sports' || cat === 'uk_sports' || cat === 'beinsports') {
    return 410 + totalBonus;
  }
  if (cat === 'espn' || cat === 'dsports' || cat === 'tnt_space') {
    return 450 + totalBonus;
  }
  if (cat === 'bein_arabic' || cat === 'china_football') {
    return 490 + statusBonus + qualityBonus;
  }

  return 600 + statusBonus + esBonus + qualityBonus + Math.min(200, ch.dial || 100);
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
      const normLang = normalizeLiveTrackLang(tr.lang, `${tr.label} ${ch.name}`, ch.countryCode);
      return {
        ...tr,
        lang: normLang,
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

    if (!existing.channel.logoUrl && ch.logoUrl) {
      existing.channel = { ...existing.channel, logoUrl: ch.logoUrl };
    }
    if (!existing.channel.epgChannelId && ch.epgChannelId) {
      existing.channel = { ...existing.channel, epgChannelId: ch.epgChannelId };
    }
    if (!existing.channel.countryCode && ch.countryCode) {
      existing.channel = { ...existing.channel, countryCode: ch.countryCode };
    }
    existing.channel = {
      ...existing.channel,
      channels: existing.tracks,
    };
  }

  const result: T[] = [];
  for (const entry of byKey.values()) {
    const hasEs =
      String(entry.channel.countryCode || '').toUpperCase() === 'ES' ||
      entry.tracks.some((tr) => normalizeLiveTrackLang(tr.lang, tr.label) === 'ES');
    const sortedTracks = [...entry.tracks].sort(
      (a, b) => liveTrackSortScore(a, hasEs) - liveTrackSortScore(b, hasEs)
    );
    const bestPlayableTrack = sortedTracks.find((t) => t.health?.status !== 'down') || sortedTracks[0];
    const bestQualityLabel = bestPlayableTrack
      ? inferStreamQualityTag(bestPlayableTrack.quality, bestPlayableTrack.label, bestPlayableTrack.sourceUrl).label
      : entry.channel.quality || 'HD';
    result.push({
      ...entry.channel,
      quality: bestQualityLabel,
      channels: sortedTracks,
    });
  }

  return result;
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
