import type {
  ProviderLiveItem,
  ProviderMovieItem,
  ProviderSeriesItem,
} from '../../../src/types/providers.ts';
import type { TrackRecord } from '../../extractors/httpHelpers.ts';
import {
  fetchProviderSeriesInfo,
  getAllCachedProviderCatalogs,
  syncProviderCatalog,
  warmDefaultProvidersBackground,
} from './xtreamMultiProviderService.ts';
import {
  fastProviderSearchCache,
  getOrBuildProviderSignalIndex,
} from './xtreamFastSignalIndex.ts';

const QUALITY_AND_TAG_NOISE_RE =
  /\b(?:4k|uhd|fhd|hd|sd|hevc|h\.?265|h\.?264|x264|x265|1080p|720p|vip|raw|backup|multi|es|esp|spa|eng|en|lat|fr|ar|pt|it|de|nl|tr)\b/gi;

const LIVE_CHANNEL_ALIASES: Array<[RegExp, string[]]> = [
  [/\bla\s*1\b|\btve\s*1\b/i, ['la 1', 'tve 1', 'tve1', 'la1']],
  [/\bla\s*2\b|\btve\s*2\b/i, ['la 2', 'tve 2', 'tve2', 'la2']],
  [/\bantena\s*3\b/i, ['antena 3', 'antena3', 'a3']],
  [/\bcuatro\b/i, ['cuatro', '4']],
  [/\btelecinco\b|\btele\s*5\b/i, ['telecinco', 'tele 5', 't5']],
  [/\bla\s*sexta\b|\blasexta\b/i, ['lasexta', 'la sexta']],
  [/\b24\s*h\b|\b24\s*horas\b/i, ['24h', '24 horas', 'canal 24 horas', 'tve 24h', '24h tve']],
  [/\bgol\s*play\b|\bgol\s*tv\b/i, ['gol play', 'gol mundial', 'gol']],
  [/\bteledeporte\b|\btdp\b/i, ['teledeporte', 'tdp']],
  [/\besport\s*3\b/i, ['esport 3', 'esport3']],
  [/\btv\s*3\b|\btv3\b/i, ['tv3', 'tv 3']],
  [/\bneox\b/i, ['neox']],
  [/\bnova\b/i, ['nova']],
  [/\bmega\b|\bchiringuito\b/i, ['mega', 'mega spain', 'mega es']],
  [/\batreseries\b|\ba3s\b/i, ['atreseries', 'a3s', 'atres series']],
  [/\bfdf\b|factor[ií]a\s*de\s*ficci[oó]n/i, ['fdf', 'factoria de ficcion']],
  [/\benergy\b/i, ['energy']],
  [/\bdivinity\b/i, ['divinity']],
  [/\bbe\s*mad\b|\bbemad\b/i, ['be mad', 'bemad']],
  [/\bboing\b/i, ['boing']],
  [/\bclan\b/i, ['clan', 'clan tve', 'clan rtve']],
  [/\bdmax\b/i, ['dmax', 'discovery max']],
  [/\bdkiss\b/i, ['dkiss', 'd kiss']],
  [/\bten\b/i, ['ten', 'ten tv', 'ten spain']],
  [/\btrece\b|\b13\s*tv\b/i, ['trece', 'trece tv', '13 tv', '13tv']],
  [/\bmovistar\s*laliga\b|\blaliga\s*tv\b/i, ['movistar laliga', 'm laliga', 'laliga tv', 'm+ laliga']],
  [/\bmovistar\s*liga\s*de\s*campeones\b|\bliga\s*de\s*campeones\b|\bchampions\b/i, ['liga de campeones', 'm liga de campeones', 'champions']],
  [/\bdazn\s*laliga\b/i, ['dazn laliga', 'dazn es']],
  [/\bdazn\s*f1\b/i, ['dazn f1', 'm formula 1']],
  [/\brealmadrid\s*tv\b|\breal\s*madrid\s*tv\b/i, ['real madrid tv', 'realmadrid tv']],
  [/\bbein\s*sports\b/i, ['bein sports', 'bein']],
];

const AMBIGUOUS_TDT_CHANNEL_RE =
  /^(?:ten|mega|nova|energy|fdf|clan|boing|cuatro|trece|24\s*h|la\s*1|la\s*2|neox|divinity|dmax|dkiss)$/i;

const SPANISH_TDT_POSITIVE_RE =
  /\b(?:ES|ESP|SPAIN|ESPAÑA|ESPANA|TDT|CASTELLANO)\b|^\s*(?:ES|ESP)\s*[:|\-]/i;

const NON_SPANISH_HOMONYM_RE =
  /\b(?:SPORTS?|GREECE|GREEK|INDIA|INDIAN|TURK|ARAB|LATINO|MEXICO|ARGENTINA|COLOMBIA|CHILE|PERU|USA|UK|FRANCE|FRENCH|ITALIA|ITALY|GERMANY|PORTUGAL|BRAZIL|BRASIL|POLAND|CZECH|NRJ|ROMANIA|BULGARIA)\b/i;

export function normalizeProviderMatchTitle(raw: string): string {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\[[^\]]*\]|\([^)]*\)|\|[^|]*\|/g, ' ')
    .replace(/[:._\-/]+/g, ' ')
    .replace(QUALITY_AND_TAG_NOISE_RE, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeRawSearchable(raw: string): string {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreLanguageAffinity(detectedLang: string, preferLang: string): number {
  const pref = String(preferLang || 'ES').toUpperCase();
  const det = String(detectedLang || 'INTL').toUpperCase();
  if (det === pref) return 45;
  if (pref !== 'AR' && det === 'AR') return -60;
  if (pref === 'ES' && det === 'LAT') return 20;
  if (pref === 'LAT' && det === 'ES') return 18;
  if (pref === 'ES' && det === 'VOSE') return 12;
  if (det === 'EN') return 4;
  return 0;
}

function scoreTextMatch(
  cleanCandidate: string,
  rawCandidate: string,
  queryVariants: string[],
  preferYear?: string
): number {
  if (!cleanCandidate) return 0;
  let best = 0;

  for (const q of queryVariants) {
    if (!q || q.length < 2) continue;
    if (cleanCandidate === q) {
      best = Math.max(best, 100);
      continue;
    }
    const tokensQ = q.split(' ').filter((t) => t.length >= 2);
    const tokensC = cleanCandidate.split(' ').filter((t) => t.length >= 2);
    if (tokensQ.length === 0 || tokensC.length === 0) continue;

    if (cleanCandidate.startsWith(`${q} `) || cleanCandidate.endsWith(` ${q}`)) {
      best = Math.max(best, 86);
    } else if (cleanCandidate.includes(q)) {
      best = Math.max(best, 76);
    } else {
      const cSet = new Set(tokensC);
      let hits = 0;
      for (const tok of tokensQ) {
        if (cSet.has(tok)) hits += 1;
      }
      if (hits === tokensQ.length) {
        const extraPenalty = Math.max(0, tokensC.length - tokensQ.length) * 4;
        best = Math.max(best, Math.max(55, 82 - extraPenalty));
      } else if (tokensQ.length >= 2 && hits >= Math.ceil(tokensQ.length * 0.75)) {
        best = Math.max(best, 48);
      }
    }
  }

  if (best > 0 && preferYear && /\b\d{4}\b/.test(preferYear)) {
    if (rawCandidate.includes(preferYear)) best += 12;
  }
  return best;
}

export function isPreferredSharkProSpainLjli(item: Pick<ProviderLiveItem, 'providerId' | 'categoryName'>): boolean {
  return (
    String(item.providerId || '').toLowerCase() === 'shark-pro' &&
    /spain\s*[-_]\s*(?:ljli|أسبانيا|اسبانيا)/i.test(String(item.categoryName || ''))
  );
}

export async function ensureFastWarmCatalogsAvailable(): Promise<void> {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) return;
  const existing = getAllCachedProviderCatalogs();
  if (existing.length >= 2) return;
  warmDefaultProvidersBackground();
  // Wait briefly for the fastest verified Spanish TDT servers ('dana-4k-pro', 'octopus-tv', '24tv', 'shark-pro', 'ultra-vip') only when cold
  await Promise.race([
    Promise.allSettled([
      syncProviderCatalog('dana-4k-pro', false),
      syncProviderCatalog('octopus-tv', false),
      syncProviderCatalog('24tv', false),
      syncProviderCatalog('shark-pro', false),
      syncProviderCatalog('ultra-vip', false),
    ]),
    new Promise<void>((r) => setTimeout(r, 2500)),
  ]);
}

function getSpanishServerSpeedBoost(providerId: string): number {
  const id = String(providerId || '').toLowerCase();
  if (id === 'dana-4k-pro') return 48; // ~423-440ms direct HLS + full segment delivery
  if (id === 'octopus-tv') return 26; // ~945-1015ms direct HLS, single active account
  if (id === '24tv') return 22; // ~739-789ms direct HLS on working channels
  if (id === 'shark-pro') return 16; // Same CDN as Octopus TV once rotated
  if (id === 'ultra-vip') return 4;
  return 0;
}

export interface ProviderUnifiedSearchResult {
  live: ProviderLiveItem[];
  movies: ProviderMovieItem[];
  series: ProviderSeriesItem[];
  indexedProviders: number;
}

export async function searchFastProviderIndex(
  rawQuery: string,
  limitPerType = 16
): Promise<ProviderUnifiedSearchResult> {
  const cleanQ = normalizeProviderMatchTitle(rawQuery);
  const rawNormQ = normalizeRawSearchable(rawQuery);
  if (!cleanQ && rawNormQ.length < 2) {
    return { live: [], movies: [], series: [], indexedProviders: 0 };
  }

  await ensureFastWarmCatalogsAvailable();
  const catalogs = getAllCachedProviderCatalogs();
  if (catalogs.length === 0) {
    return { live: [], movies: [], series: [], indexedProviders: 0 };
  }

  const cacheKey = `${rawNormQ || cleanQ}|${limitPerType}|${catalogs.length}`;
  const cachedSearch = fastProviderSearchCache.get(cacheKey);
  if (cachedSearch) return cachedSearch;

  const variants = Array.from(new Set([cleanQ, rawNormQ].filter((v) => v.length >= 2)));
  const scoredLive: Array<{ item: ProviderLiveItem; score: number }> = [];
  const scoredMovies: Array<{ item: ProviderMovieItem; score: number }> = [];
  const scoredSeries: Array<{ item: ProviderSeriesItem; score: number }> = [];

  for (const cat of catalogs) {
    const idx = getOrBuildProviderSignalIndex(cat, normalizeProviderMatchTitle, normalizeRawSearchable);
    for (let i = 0; i < idx.liveEntries.length; i++) {
      const entry = idx.liveEntries[i];
      const s = scoreTextMatch(entry.normName, entry.rawName, variants);
      if (s >= 55) scoredLive.push({ item: entry.item, score: s });
    }
    for (let i = 0; i < idx.movieEntries.length; i++) {
      const entry = idx.movieEntries[i];
      const base = scoreTextMatch(entry.normName, entry.rawName, variants, entry.item.year);
      if (base >= 58) {
        const langBoost =
          entry.lang === 'ES' ? 25 : entry.lang === 'LAT' ? 14 : entry.lang === 'VOSE' ? 8 : entry.lang === 'AR' ? -30 : 0;
        scoredMovies.push({ item: entry.item, score: base + langBoost });
      }
    }
    for (let i = 0; i < idx.seriesEntries.length; i++) {
      const entry = idx.seriesEntries[i];
      const base = scoreTextMatch(entry.normName, entry.rawName, variants, entry.item.year);
      if (base >= 58) {
        const langBoost =
          entry.lang === 'ES' ? 25 : entry.lang === 'LAT' ? 14 : entry.lang === 'VOSE' ? 8 : entry.lang === 'AR' ? -30 : 0;
        scoredSeries.push({ item: entry.item, score: base + langBoost });
      }
    }
  }

  scoredLive.sort((a, b) => b.score - a.score);
  scoredMovies.sort((a, b) => b.score - a.score);
  scoredSeries.sort((a, b) => b.score - a.score);

  const searchResult: ProviderUnifiedSearchResult = {
    live: scoredLive.slice(0, limitPerType).map((x) => x.item),
    movies: scoredMovies.slice(0, limitPerType).map((x) => x.item),
    series: scoredSeries.slice(0, limitPerType).map((x) => x.item),
    indexedProviders: catalogs.length,
  };
  fastProviderSearchCache.set(cacheKey, searchResult);
  return searchResult;
}

export async function findFastProviderLiveSignals(
  channelTitle: string,
  limit = 6
): Promise<TrackRecord[]> {
  const cleanTitle = normalizeProviderMatchTitle(channelTitle);
  const rawTitle = normalizeRawSearchable(channelTitle);
  if (!cleanTitle && rawTitle.length < 2) return [];

  await ensureFastWarmCatalogsAvailable();
  const catalogs = getAllCachedProviderCatalogs();
  if (catalogs.length === 0) return [];

  const variantSet = new Set<string>();
  if (cleanTitle.length >= 2) variantSet.add(cleanTitle);
  if (rawTitle.length >= 2) variantSet.add(rawTitle);
  for (const [pattern, aliases] of LIVE_CHANNEL_ALIASES) {
    if (pattern.test(channelTitle)) {
      for (const alias of aliases) variantSet.add(alias);
    }
  }
  const variants = Array.from(variantSet);

  const requiresSpanishIndicator =
    AMBIGUOUS_TDT_CHANNEL_RE.test(cleanTitle) || AMBIGUOUS_TDT_CHANNEL_RE.test(rawTitle);

  const candidates: Array<{ item: ProviderLiveItem; lang: string; score: number }> = [];
  for (const cat of catalogs) {
    const idx = getOrBuildProviderSignalIndex(cat, normalizeProviderMatchTitle, normalizeRawSearchable);
    for (let i = 0; i < idx.liveEntries.length; i++) {
      const entry = idx.liveEntries[i];
      const item = entry.item;
      const hay = ` ${item.name} ${item.categoryName} `;
      if (requiresSpanishIndicator) {
        if (!SPANISH_TDT_POSITIVE_RE.test(hay) || NON_SPANISH_HOMONYM_RE.test(hay)) {
          continue;
        }
      }
      let score = scoreTextMatch(entry.normName, entry.rawName, variants);
      if (score <= 0) continue;

      const hayUpper = entry.hayUpper;
      if (/\b(ES|ESP|ESPAÑA|SPAIN|TDT)\b/.test(hayUpper)) score += 16;
      if (/\b(4K|UHD)\b/.test(hayUpper)) score += 14;
      else if (/\b(FHD|1080P?|HEVC)\b/.test(hayUpper)) score += 10;
      else if (/\bHD\b/.test(hayUpper)) score += 6;
      if (/\b(SD|LOW)\b/.test(hayUpper)) score -= 6;
      score += getSpanishServerSpeedBoost(item.providerId);
      if (isPreferredSharkProSpainLjli(item)) {
        score += /\b(FHD|1080P?|4K|UHD)\b/.test(hayUpper) ? 35 : 22;
      } else if (/spain\s*[-_]\s*(?:ljli|أسبانيا|اسبانيا)/i.test(item.categoryName)) {
        score += 14;
      }
      candidates.push({ item, lang: entry.lang, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const picked: TrackRecord[] = [];
  const usedProviders = new Set<string>();
  for (const { item, lang, score } of candidates) {
    if (score < 62) break;
    if (usedProviders.has(item.providerId) && picked.length >= 2) continue;
    usedProviders.add(item.providerId);
    const isPriorityShark = isPreferredSharkProSpainLjli(item);
    picked.push({
      id: isPriorityShark ? `fast-priority-${item.id}` : `fast-${item.id}`,
      label: isPriorityShark
        ? `Prioritaria · ${item.name} · ${item.providerName} (${item.categoryName})`
        : `Señal Rápida · ${item.providerName}`,
      lang,
      providerId: item.providerId,
      providerName: item.providerName,
      sourceUrl: item.playbackUrl,
      resolvedStreamUrl: item.playbackUrl,
      resolverType: 'direct_hls',
    } as TrackRecord);
    if (picked.length >= limit) break;
  }

  return picked;
}

export async function findFastProviderVodOrSeriesSignals(params: {
  mediaType: 'movie' | 'tv';
  title: string;
  origTitle?: string;
  year?: string;
  season?: number;
  episode?: number;
  preferLang?: string;
  limit?: number;
}): Promise<TrackRecord[]> {
  const {
    mediaType,
    title,
    origTitle,
    year,
    season,
    episode,
    preferLang = 'ES',
    limit = 4,
  } = params;

  const variants = Array.from(
    new Set(
      [
        normalizeProviderMatchTitle(title),
        normalizeRawSearchable(title),
        origTitle ? normalizeProviderMatchTitle(origTitle) : '',
        origTitle ? normalizeRawSearchable(origTitle) : '',
      ].filter((v) => v.length >= 2)
    )
  );
  if (variants.length === 0) return [];

  await ensureFastWarmCatalogsAvailable();
  const catalogs = getAllCachedProviderCatalogs();
  if (catalogs.length === 0) return [];

  if (mediaType === 'movie') {
    const candidates: Array<{ item: ProviderMovieItem; score: number; lang: string }> = [];
    for (const cat of catalogs) {
      const idx = getOrBuildProviderSignalIndex(cat, normalizeProviderMatchTitle, normalizeRawSearchable);
      for (let i = 0; i < idx.movieEntries.length; i++) {
        const entry = idx.movieEntries[i];
        const baseScore = scoreTextMatch(entry.normName, entry.rawName, variants, year);
        if (baseScore < 65) continue;
        const score = baseScore + scoreLanguageAffinity(entry.lang, preferLang);
        candidates.push({ item: entry.item, score, lang: entry.lang });
      }
    }

    candidates.sort((a, b) => b.score - a.score);

    const tracks: TrackRecord[] = [];
    const seenIds = new Set<string>();
    for (const { item, lang } of candidates) {
      if (seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      tracks.push({
        id: `fast-${item.id}`,
        label: `Fuente Directa · ${item.providerName}`,
        lang,
        sourceUrl: item.playbackUrl,
        resolvedStreamUrl: item.playbackUrl,
        resolverType: item.ext === 'm3u8' ? 'direct_hls' : 'direct_mp4',
      });
      if (tracks.length >= limit) break;
    }
    return tracks;
  }

  // Series episode fast resolution
  if (!season || !episode) return [];
  const seriesMatches: Array<{ item: ProviderSeriesItem; score: number; lang: string }> = [];
  for (const cat of catalogs) {
    const idx = getOrBuildProviderSignalIndex(cat, normalizeProviderMatchTitle, normalizeRawSearchable);
    for (let i = 0; i < idx.seriesEntries.length; i++) {
      const entry = idx.seriesEntries[i];
      const baseScore = scoreTextMatch(entry.normName, entry.rawName, variants, year);
      if (baseScore < 65) continue;
      seriesMatches.push({
        item: entry.item,
        score: baseScore + scoreLanguageAffinity(entry.lang, preferLang),
        lang: entry.lang,
      });
    }
  }

  seriesMatches.sort((a, b) => b.score - a.score);
  const topSeries: Array<{ item: ProviderSeriesItem; lang: string }> = [];
  const usedProvs = new Set<string>();
  for (const cand of seriesMatches) {
    if (usedProvs.has(cand.item.providerId)) continue;
    usedProvs.add(cand.item.providerId);
    topSeries.push({ item: cand.item, lang: cand.lang });
    if (topSeries.length >= 6) break;
  }
  if (topSeries.length === 0) return [];

  const resolvedInfos = await Promise.allSettled(
    topSeries.map(async ({ item, lang }) => {
      const info = await Promise.race([
        fetchProviderSeriesInfo(item.providerId, item.seriesId),
        new Promise<null>((r) => setTimeout(() => r(null), 2600)),
      ]);
      if (!info) return null;
      const eps = info.episodesBySeason[String(season)] || [];
      const ep = eps.find((e) => e.episodeNum === episode);
      if (!ep) return null;
      return {
        id: `fast-${ep.id}`,
        label: `Fuente Directa · ${item.providerName}`,
        lang: lang !== 'INTL' ? lang : 'ES',
        sourceUrl: ep.playbackUrl,
        resolvedStreamUrl: ep.playbackUrl,
        resolverType: ep.ext === 'm3u8' ? ('direct_hls' as const) : ('direct_mp4' as const),
      };
    })
  );

  const tracks: TrackRecord[] = [];
  for (const r of resolvedInfos) {
    if (r.status === 'fulfilled' && r.value) {
      tracks.push(r.value);
    }
  }
  return tracks;
}

const SPANISH_CATEGORY_OR_NAME_RE =
  /\b(?:SPAIN|ESPAÑA|ESPANA|ES\||ESP\b|TDT|CASTELLANO|CATALU[ÑN]A|CATAL[AÀ]|EUSKADI|GALICIA|ANDALUC[IÍ]A|MADRID)\b|^\s*(?:ES|ESP)\s*[:|\-]/i;

const EXCLUDE_NON_TDT_NOISE_RE =
  /\b(?:XXX|ADULT|18\+|PORN|PPV|EVENT|REPLAY|ARAB|BEIN\s*AR|FRANCE|FRENCH|ITALIA|GERMANY|PORTUGAL|BRAZIL|LATINO|MEXICO|ARGENTINA|COLOMBIA|USA|UK)\b/i;

function inferSpanishTdtCategory(rawName: string, rawCategory: string): string {
  const hay = `${rawName} ${rawCategory}`.toLowerCase();
  if (/\b(24\s*h|noticias|news|3\/24|324|euronews)\b/.test(hay)) return 'noticias_deportes';
  if (/\b(deporte|sport|tdp|teledeporte|gol|dazn|laliga|campeones|vamos|esport|eurosport|real\s*madrid|barca)\b/.test(hay)) {
    return 'noticias_deportes';
  }
  if (/\b(cine|pelicula|película|series|paramount|hollywood|axn|fox|star|warner|tnt|syfy|calle\s*13|comedy|atreseries|fdf|energy|divinity|nova|neox|mega)\b/.test(hay)) {
    return 'cine_series';
  }
  if (/\b(boing|clan|disney|nick|sx3|super3|cartoon)\b/.test(hay)) return 'infantil_autonomicas';
  if (/\b(tv3|etb|canal\s*sur|telemadrid|tvg|arag[oó]n|tpa|ib3|apunt|à\s*punt|canal\s*extremadura|7rm|tv\s*canaria)\b/.test(hay)) {
    return 'infantil_autonomicas';
  }
  if (/\b(la\s*1|tve\s*1|la\s*2|tve\s*2|antena\s*3|cuatro|telecinco|la\s*sexta|lasexta)\b/.test(hay)) {
    return 'generalistas';
  }
  return 'entretenimiento';
}

function collectCachedSpanishIndexedEntries() {
  const catalogs = getAllCachedProviderCatalogs();
  if (catalogs.length === 0) return [];
  return catalogs.flatMap(
    (cat) => getOrBuildProviderSignalIndex(cat, normalizeProviderMatchTitle, normalizeRawSearchable).spanishLiveEntries
  );
}

export interface EnrichableTdtChannel {
  id: string;
  dial?: number;
  name: string;
  category: string;
  network?: string;
  quality?: string;
  description?: string;
  shortMark?: string;
  brandTone?: string;
  logoUrl?: string;
  countryCode?: string;
  channels: Array<{
    id: string;
    label: string;
    lang?: string;
    quality?: string;
    sourceUrl: string;
    resolverType?: string;
  }>;
}

export function enrichTdtCatalogWithProviderChannels<T extends EnrichableTdtChannel>(
  baseChannels: T[],
  opts?: { preferQualityFirst?: boolean }
): T[] {
  const preIndexed = collectCachedSpanishIndexedEntries();
  if (preIndexed.length === 0) return baseChannels;

  const boostDelta = opts?.preferQualityFirst ? 1.7 : 1;
  const indexedSpanish = preIndexed.map((entry) => ({
    item: entry.item,
    cleanName: entry.cleanName,
    rawNorm: entry.rawNorm,
    qualityMeta: {
      label: entry.qualityLabel,
      boost: Math.round(entry.qualityBoost * boostDelta),
    },
  }));

  const matchedProviderNormNames = new Set<string>();

  const enrichedBase = baseChannels.map((ch) => {
    const chClean = normalizeProviderMatchTitle(ch.name);
    const chRaw = normalizeRawSearchable(ch.name);
    const variants = new Set<string>();
    if (chClean.length >= 2) variants.add(chClean);
    if (chRaw.length >= 2) variants.add(chRaw);
    for (const [pattern, aliases] of LIVE_CHANNEL_ALIASES) {
      if (pattern.test(ch.name)) {
        for (const alias of aliases) variants.add(alias);
      }
    }
    const variantList = Array.from(variants);
    if (variantList.length === 0) return ch;

    const hits: Array<{ item: ProviderLiveItem; score: number; qualityLabel: string }> = [];
    for (const entry of indexedSpanish) {
      if (!entry.cleanName) continue;
      if (NON_SPANISH_HOMONYM_RE.test(`${entry.item.name} ${entry.item.categoryName}`)) continue;
      let score = 0;
      for (const v of variantList) {
        if (entry.cleanName === v) {
          score = Math.max(score, 100);
          break;
        }
        if (
          v.length >= 4 &&
          (entry.cleanName.startsWith(`${v} `) || entry.cleanName.endsWith(` ${v}`))
        ) {
          score = Math.max(score, 85);
        }
      }
      if (score >= 85) {
        score += entry.qualityMeta.boost + getSpanishServerSpeedBoost(entry.item.providerId);
        if (isPreferredSharkProSpainLjli(entry.item)) {
          score += /\b(FHD|1080P?|4K|UHD)\b/i.test(entry.item.name) ? 35 : 22;
        } else if (/spain\s*[-_]\s*(?:ljli|أسبانيا|اسبانيا)/i.test(entry.item.categoryName)) {
          score += 15;
        }
        hits.push({ item: entry.item, score, qualityLabel: entry.qualityMeta.label });
      }
    }

    if (hits.length === 0) return ch;
    hits.sort((a, b) => b.score - a.score);

    const existingUrls = new Set(ch.channels.map((c) => c.sourceUrl));
    const providerSignals: EnrichableTdtChannel['channels'] = [];
    const seenProviders = new Set<string>();

    for (const { item, qualityLabel } of hits) {
      matchedProviderNormNames.add(normalizeProviderMatchTitle(item.name));
      if (seenProviders.has(item.providerId) || existingUrls.has(item.playbackUrl)) continue;
      seenProviders.add(item.providerId);
      const isPriorityShark = isPreferredSharkProSpainLjli(item);
      providerSignals.push({
        id: isPriorityShark ? `${ch.id}-priority-${item.providerId}` : `${ch.id}-fast-${item.providerId}`,
        label: isPriorityShark
          ? `Prioritaria · ${item.name} · ${item.providerName} (${item.categoryName})`
          : `TDT Rápida · ${item.providerName}`,
        lang: 'ES',
        quality: qualityLabel,
        providerId: item.providerId,
        providerName: item.providerName,
        sourceUrl: item.playbackUrl,
        resolverType: 'tdt_hls',
      } as EnrichableTdtChannel['channels'][number]);
      if (providerSignals.length >= 4) break;
    }

    if (providerSignals.length === 0) return ch;
    return {
      ...ch,
      channels: [...providerSignals, ...ch.channels],
    };
  });

  // Also include extra Spanish TDT channels from warmed providers that aren't in baseChannels
  const extraChannels: T[] = [];
  const seenExtraCleanNames = new Set<string>();
  let nextDial = 200;

  for (const { item, cleanName } of indexedSpanish) {
    if (!cleanName || cleanName.length < 2) continue;
    if (matchedProviderNormNames.has(cleanName) || seenExtraCleanNames.has(cleanName)) continue;
    if (/^(?:---+|===+|vip\b|es\b$)/i.test(cleanName)) continue;
    seenExtraCleanNames.add(cleanName);

    const friendlyName = item.name
      .replace(/^\s*(?:ES|ESP)\s*[:|\-]\s*/i, '')
      .replace(/\s*\b(?:HEVC|FHD|HD|4K|UHD|SD|RAW|VIP)\b\s*/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim() || item.name;

    const category = inferSpanishTdtCategory(item.name, item.categoryName);
    extraChannels.push({
      id: `tdt-srv-${item.id}`,
      dial: nextDial++,
      name: friendlyName,
      category,
      network: item.providerName,
      quality: /\b(4k|uhd)\b/i.test(item.name) ? '4K' : 'HD',
      description: `${item.categoryName} · ${item.providerName}`,
      shortMark: friendlyName.slice(0, 3).toUpperCase(),
      brandTone: '#8B5CF6',
      logoUrl: item.logo || undefined,
      countryCode: 'es',
      channels: [
        {
          id: `${item.id}-hls`,
          label: `TDT Rápida · ${item.providerName}`,
          lang: 'ES',
          quality: /\b(4k|uhd)\b/i.test(item.name) ? '4K' : 'HD',
          sourceUrl: item.playbackUrl,
          resolverType: 'tdt_hls',
        },
      ],
    } as T);

    if (extraChannels.length >= 90) break;
  }

  return [...enrichedBase, ...extraChannels];
}
