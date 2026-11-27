/**
 * @module server/services/providers/xtreamFastSignalIndex
 * @description Precomputed normalized title cache and Spanish TDT slice index for sub-millisecond fast signal resolution.
 */
import type {
  ProviderCatalogSummary,
  ProviderLiveItem,
  ProviderMovieItem,
  ProviderSeriesItem,
} from '../../../src/types/providers.ts';
import { LruTtlCache } from '../../utils/lruCache.ts';
import { detectStreamLanguage } from '../../utils/streamMetaParser.ts';

export interface CachedNormalizedProviderCatalog {
  versionKey: string;
  liveEntries: Array<{
    item: ProviderLiveItem;
    normName: string;
    rawName: string;
    hayUpper: string;
    lang: string;
    tokens: string[];
  }>;
  movieEntries: Array<{
    item: ProviderMovieItem;
    normName: string;
    rawName: string;
    lang: string;
    tokens: string[];
  }>;
  seriesEntries: Array<{
    item: ProviderSeriesItem;
    normName: string;
    rawName: string;
    lang: string;
    tokens: string[];
  }>;
  spanishLiveEntries: Array<{
    item: ProviderLiveItem;
    cleanName: string;
    rawNorm: string;
    qualityLabel: string;
    qualityBoost: number;
  }>;
}

const catalogNormalizedCache = new Map<string, CachedNormalizedProviderCatalog>();
export const fastProviderSearchCache = new LruTtlCache<string, {
  live: ProviderLiveItem[];
  movies: ProviderMovieItem[];
  series: ProviderSeriesItem[];
  indexedProviders: number;
}>(250, 90_000);

const SPANISH_CATEGORY_OR_NAME_RE =
  /\b(?:SPAIN|ESPAÑA|ESPANA|ES\||ESP\b|TDT|CASTELLANO|CATALU[ÑN]A|CATAL[AÀ]|EUSKADI|GALICIA|ANDALUC[IÍ]A|MADRID)\b|^\s*(?:ES|ESP)\s*[:|\-]/i;

const EXCLUDE_NON_TDT_NOISE_RE =
  /\b(?:XXX|ADULT|18\+|PORN|PPV|EVENT|REPLAY|ARAB|BEIN\s*AR|FRANCE|FRENCH|ITALIA|GERMANY|PORTUGAL|BRAZIL|LATINO|MEXICO|ARGENTINA|COLOMBIA|USA|UK)\b/i;

function inferLiveQualityFast(name: string): { qualityLabel: string; qualityBoost: number } {
  const up = ` ${name} `.toUpperCase();
  if (/\b(4K|UHD|2160P?)\b/.test(up) && !/DANA\s*4K|VOD\s*4K/i.test(name)) {
    return { qualityLabel: '4K', qualityBoost: 16 };
  }
  if (/\b(FHD|1080P?|FULL\s*HD|HEVC)\b/.test(up)) {
    return { qualityLabel: '1080p', qualityBoost: 10 };
  }
  if (/\b(HD|720P?)\b/.test(up)) {
    return { qualityLabel: '720p', qualityBoost: 4 };
  }
  return { qualityLabel: 'HD', qualityBoost: 0 };
}

export function getOrBuildProviderSignalIndex(
  cat: {
    providerId: string;
    syncedAt?: number | null;
    liveStreams: ProviderLiveItem[];
    vodStreams: ProviderMovieItem[];
    seriesList: ProviderSeriesItem[];
  },
  normalizeMatchTitle: (raw: string) => string,
  normalizeRaw: (raw: string) => string
): CachedNormalizedProviderCatalog {
  const versionKey = `${cat.syncedAt || 0}:${cat.liveStreams.length}:${cat.vodStreams.length}:${cat.seriesList.length}`;
  const existing = catalogNormalizedCache.get(cat.providerId);
  if (existing && existing.versionKey === versionKey) {
    return existing;
  }

  const liveEntries = cat.liveStreams.map((item) => {
    const normName = normalizeMatchTitle(item.name);
    const rawName = normalizeRaw(item.name);
    const { lang } = detectStreamLanguage(item.name, item.categoryName, 'live');
    return {
      item,
      normName,
      rawName,
      hayUpper: ` ${item.name} ${item.categoryName} `.toUpperCase(),
      lang,
      tokens: (normName || rawName).split(' ').filter((t) => t.length >= 2),
    };
  });

  const movieEntries = cat.vodStreams.map((item) => {
    const normName = normalizeMatchTitle(item.name);
    const rawName = normalizeRaw(item.name);
    const { lang } = detectStreamLanguage(item.name, item.categoryName, 'movie');
    return {
      item,
      normName,
      rawName,
      lang,
      tokens: (normName || rawName).split(' ').filter((t) => t.length >= 2),
    };
  });

  const seriesEntries = cat.seriesList.map((item) => {
    const normName = normalizeMatchTitle(item.name);
    const rawName = normalizeRaw(item.name);
    const { lang } = detectStreamLanguage(item.name, item.categoryName, 'series');
    return {
      item,
      normName,
      rawName,
      lang,
      tokens: (normName || rawName).split(' ').filter((t) => t.length >= 2),
    };
  });

  const spanishLiveEntries: CachedNormalizedProviderCatalog['spanishLiveEntries'] = [];
  for (const entry of liveEntries) {
    const hay = `${entry.item.name} ${entry.item.categoryName}`;
    if (EXCLUDE_NON_TDT_NOISE_RE.test(hay)) continue;
    if (!SPANISH_CATEGORY_OR_NAME_RE.test(`${entry.item.categoryName} ${entry.item.name}`)) continue;
    const { qualityLabel, qualityBoost } = inferLiveQualityFast(entry.item.name);
    spanishLiveEntries.push({
      item: entry.item,
      cleanName: entry.normName,
      rawNorm: entry.rawName,
      qualityLabel,
      qualityBoost,
    });
  }

  const built: CachedNormalizedProviderCatalog = {
    versionKey,
    liveEntries,
    movieEntries,
    seriesEntries,
    spanishLiveEntries,
  };
  catalogNormalizedCache.set(cat.providerId, built);
  return built;
}

export function clearFastSignalIndexCache(): void {
  catalogNormalizedCache.clear();
  fastProviderSearchCache.clear();
}

export type _UnusedSummaryType = ProviderCatalogSummary;
