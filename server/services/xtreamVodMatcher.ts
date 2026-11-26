/**
 * @module server/services/xtreamVodMatcher
 * @description Bilingual/translated title matcher across all connected Xtream servers
 * (Shark Pro, VOD 4K, 24TV, 2M2H, Dana 4K Pro, Active CDNS, Octopus TV) for Movies & Series.
 * Parses language + resolution/quality tags (4K UHD > 1080p FHD > HD > SD), emits TrackRecords
 * for extraction and credential-free XtreamMatchedMediaOption items for detail modals.
 */
import type { TrackRecord } from '../extractors/httpHelpers.ts';
import { LruTtlCache } from '../utils/lruCache.ts';
import { getAllXtreamProviders } from './providersConfig.ts';
import {
  getCachedXtreamProviderCatalogs,
  getSeriesInfo,
  isXtreamEnvConfigured,
  syncFullCatalog,
  type XtreamCategoryItem,
  type XtreamFullCatalogPayload,
  type XtreamLiveStreamItem,
  type XtreamSeriesEpisodeItem,
  type XtreamSeriesInfoPayload,
  type XtreamSeriesItem,
  type XtreamVodStreamItem,
} from './xtreamService.ts';
import {
  getConnectedProvidersCatalogSnapshot,
  getProviderSeriesDetail,
} from './providers/xtreamProvidersService.ts';
import { getAllCachedProviderCatalogs } from './providers/xtreamMultiProviderService.ts';
import {
  parseStreamMetadata,
  type CanonicalStreamLang,
} from '../utils/streamMetaParser.ts';

export type XtreamDetectedLang = CanonicalStreamLang;

export interface XtreamMatchedMediaOption {
  id: string;
  mediaType: 'movie' | 'tv';
  providerId: string;
  providerName: string;
  streamId: string;
  seriesId?: string;
  title: string;
  cleanTitle: string;
  year?: string;
  categoryName: string;
  lang: XtreamDetectedLang;
  langLabel: string;
  quality: string;
  qualityTier: number;
  containerExtension: string;
  rating?: string;
  poster?: string;
  playbackUrl?: string;
  score: number;
}

export interface ParsedXtreamVodMeta {
  cleanTitle: string;
  year?: string;
  lang: XtreamDetectedLang;
  langLabel: string;
  quality: string;
  qualityTier: number;
}

const seriesInfoCache = new LruTtlCache<string, XtreamSeriesInfoPayload>(200, 25 * 60 * 1000);

export function detectXtreamQuality(
  rawName: string,
  categoryName = '',
  containerExt = ''
): { quality: string; qualityTier: number } {
  const parsed = parseStreamMetadata(rawName, categoryName, 'movie', containerExt);
  return { quality: parsed.quality, qualityTier: parsed.qualityTier };
}

export function detectXtreamLanguage(
  rawName: string,
  categoryName = ''
): { lang: XtreamDetectedLang; langLabel: string } {
  const parsed = parseStreamMetadata(rawName, categoryName, 'movie');
  return { lang: parsed.lang, langLabel: parsed.langLabel };
}

export function parseXtreamVodTitleMeta(
  rawName: string,
  categoryName = '',
  containerExtension = ''
): ParsedXtreamVodMeta {
  const parsed = parseStreamMetadata(rawName, categoryName, 'movie', containerExtension);
  return {
    cleanTitle: parsed.cleanTitle,
    year: parsed.year,
    lang: parsed.lang,
    langLabel: parsed.langLabel,
    quality: parsed.quality,
    qualityTier: parsed.qualityTier,
  };
}

function normalizeMatchText(raw: string, stripLeadingArticle = false): string {
  let norm = String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\bpart\s+i\b/g, 'part 1')
    .replace(/\bpart\s+ii\b/g, 'part 2')
    .replace(/\bpart\s+iii\b/g, 'part 3')
    .replace(/\bpart\s+iv\b/g, 'part 4')
    .replace(/\bparte\s+i\b/g, 'parte 1')
    .replace(/\bparte\s+ii\b/g, 'parte 2')
    .replace(/\bparte\s+iii\b/g, 'parte 3')
    .replace(/\bparte\s+iv\b/g, 'parte 4')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (stripLeadingArticle) {
    norm = norm.replace(/^(?:the|a|an|el|la|los|las|un|una|unos|unas|le|les|l|he)\s+/i, '').trim();
  }
  return norm;
}

const STOP_WORDS = new Set(['the', 'a', 'an', 'el', 'la', 'los', 'las', 'de', 'del', 'y', 'and', 'of', 'in', 'en', 'he']);

function tokenizeMeaningful(raw: string): string[] {
  return normalizeMatchText(raw, true)
    .split(' ')
    .filter((tok) => tok.length >= 2 && !STOP_WORDS.has(tok));
}

function buildHintVectors(titleHints: string[]) {
  const seen = new Set<string>();
  const out: Array<{ exact: string; noArt: string; tokens: string[]; idx: number }> = [];
  titleHints.forEach((raw, idx) => {
    const clean = String(raw || '').trim();
    if (!clean) return;
    const exact = normalizeMatchText(clean, false);
    const noArt = normalizeMatchText(clean, true);
    if (!exact || exact.length < 2 || seen.has(exact)) return;
    seen.add(exact);
    out.push({
      exact,
      noArt: noArt || exact,
      tokens: tokenizeMeaningful(clean),
      idx,
    });
  });
  return out;
}

const unifiedCatalogRamCache = new LruTtlCache<string, XtreamFullCatalogPayload>(2, 45_000);
let lastUnifiedMultiProviderCount = 0;

interface IndexedVodMovieEntry {
  item: XtreamVodStreamItem;
  pid: string;
  catName: string;
  parsed: ParsedXtreamVodMeta;
  candExact: string;
  candNoArt: string;
  candTokenSet: Set<string>;
}

interface IndexedVodSeriesEntry {
  item: XtreamSeriesItem;
  pid: string;
  catName: string;
  serYear?: string;
  parsed: ParsedXtreamVodMeta;
  candExact: string;
  candNoArt: string;
  candTokenSet: Set<string>;
}

interface VodCatalogSearchIndex<T> {
  entries: T[];
  exactMap: Map<string, number[]>;
  tokenMap: Map<string, number[]>;
}

let cachedVodMovieSource: XtreamVodStreamItem[] | null = null;
let cachedVodMovieBuiltAt = 0;
let cachedVodMovieIndex: VodCatalogSearchIndex<IndexedVodMovieEntry> | null = null;

let cachedVodSeriesSource: XtreamSeriesItem[] | null = null;
let cachedVodSeriesBuiltAt = 0;
let cachedVodSeriesIndex: VodCatalogSearchIndex<IndexedVodSeriesEntry> | null = null;

function appendIndexKey(map: Map<string, number[]>, key: string, idx: number): void {
  if (!key) return;
  let list = map.get(key);
  if (!list) {
    list = [idx];
    map.set(key, list);
  } else if (list[list.length - 1] !== idx) {
    list.push(idx);
  }
}

function querySearchIndexCandidates<T>(
  index: VodCatalogSearchIndex<T>,
  hints: Array<{ exact: string; noArt: string; tokens: string[] }>
): number[] {
  const candidateSet = new Set<number>();
  for (const h of hints) {
    const exactHits = index.exactMap.get(h.exact);
    if (exactHits) {
      for (const idx of exactHits) candidateSet.add(idx);
    }
    if (h.noArt && h.noArt !== h.exact) {
      const noArtHits = index.exactMap.get(h.noArt);
      if (noArtHits) {
        for (const idx of noArtHits) candidateSet.add(idx);
      }
    }
    // Gather candidates via shortest posting list among meaningful tokens (>=2 chars)
    let shortestList: number[] | null = null;
    for (const tok of h.tokens) {
      const hits = index.tokenMap.get(tok);
      if (!hits || hits.length === 0) continue;
      if (!shortestList || hits.length < shortestList.length) {
        shortestList = hits;
      }
    }
    if (shortestList) {
      for (const idx of shortestList) candidateSet.add(idx);
    }
    // Also union second-shortest posting list in case 1 word has slight spelling variance
    if (h.tokens.length >= 2) {
      for (const tok of h.tokens) {
        const hits = index.tokenMap.get(tok);
        if (hits && hits.length <= 250) {
          for (const idx of hits) candidateSet.add(idx);
        }
      }
    }
  }
  return Array.from(candidateSet);
}

function getIndexedVodMovies(catalog: XtreamFullCatalogPayload): VodCatalogSearchIndex<IndexedVodMovieEntry> {
  const now = Date.now();
  if (
    cachedVodMovieSource === catalog.vodStreams &&
    now - cachedVodMovieBuiltAt < 60_000 &&
    cachedVodMovieIndex
  ) {
    return cachedVodMovieIndex;
  }
  const catLookup = buildCategoryLookup(catalog.vodCategories);
  const entries: IndexedVodMovieEntry[] = [];
  const exactMap = new Map<string, number[]>();
  const tokenMap = new Map<string, number[]>();

  for (const item of catalog.vodStreams as XtreamVodStreamItem[]) {
    const pid = item.providerId || 'primary';
    const catName =
      catLookup.get(item.categoryId) ||
      catLookup.get(`${pid}:${item.categoryId}`) ||
      'VOD';
    const parsed = parseXtreamVodTitleMeta(item.name, catName, item.containerExtension);
    const candExact = normalizeMatchText(parsed.cleanTitle, false);
    const candNoArt = normalizeMatchText(parsed.cleanTitle, true);
    if (!candExact && !candNoArt) continue;
    const candTokens = tokenizeMeaningful(parsed.cleanTitle);
    const idx = entries.length;
    entries.push({
      item,
      pid,
      catName,
      parsed,
      candExact,
      candNoArt,
      candTokenSet: new Set(candTokens),
    });
    appendIndexKey(exactMap, candExact, idx);
    if (candNoArt && candNoArt !== candExact) appendIndexKey(exactMap, candNoArt, idx);
    for (const tok of candTokens) appendIndexKey(tokenMap, tok, idx);
  }

  cachedVodMovieSource = catalog.vodStreams;
  cachedVodMovieBuiltAt = now;
  cachedVodMovieIndex = { entries, exactMap, tokenMap };
  return cachedVodMovieIndex;
}

function getIndexedVodSeries(catalog: XtreamFullCatalogPayload): VodCatalogSearchIndex<IndexedVodSeriesEntry> {
  const now = Date.now();
  if (
    cachedVodSeriesSource === catalog.series &&
    now - cachedVodSeriesBuiltAt < 60_000 &&
    cachedVodSeriesIndex
  ) {
    return cachedVodSeriesIndex;
  }
  const catLookup = buildCategoryLookup(catalog.seriesCategories);
  const entries: IndexedVodSeriesEntry[] = [];
  const exactMap = new Map<string, number[]>();
  const tokenMap = new Map<string, number[]>();

  for (const ser of catalog.series as XtreamSeriesItem[]) {
    const pid = ser.providerId || 'primary';
    const catName =
      catLookup.get(ser.categoryId) ||
      catLookup.get(`${pid}:${ser.categoryId}`) ||
      'Series';
    const parsed = parseXtreamVodTitleMeta(ser.name, catName, '');
    const candExact = normalizeMatchText(parsed.cleanTitle, false);
    const candNoArt = normalizeMatchText(parsed.cleanTitle, true);
    if (!candExact && !candNoArt) continue;
    const serYear =
      parsed.year ||
      (ser.releaseDate ? String(ser.releaseDate).match(/(19\d{2}|20[0-3]\d)/)?.[1] : undefined);
    const candTokens = tokenizeMeaningful(parsed.cleanTitle);
    const idx = entries.length;
    entries.push({
      item: ser,
      pid,
      catName,
      serYear,
      parsed,
      candExact,
      candNoArt,
      candTokenSet: new Set(candTokens),
    });
    appendIndexKey(exactMap, candExact, idx);
    if (candNoArt && candNoArt !== candExact) appendIndexKey(exactMap, candNoArt, idx);
    for (const tok of candTokens) appendIndexKey(tokenMap, tok, idx);
  }

  cachedVodSeriesSource = catalog.series;
  cachedVodSeriesBuiltAt = now;
  cachedVodSeriesIndex = { entries, exactMap, tokenMap };
  return cachedVodSeriesIndex;
}

function scorePreindexedCandidate(
  candExact: string,
  candNoArt: string,
  candTokenSet: Set<string>,
  candidateYear: string | undefined,
  normalizedHints: Array<{ exact: string; noArt: string; tokens: string[]; idx: number }>,
  yearHint?: string
): number {
  if (!candExact && !candNoArt) return 0;
  let yearMismatch = false;
  let yearExact = false;
  if (yearHint && /^\d{4}$/.test(yearHint) && candidateYear && /^\d{4}$/.test(candidateYear)) {
    const diff = Math.abs(Number(yearHint) - Number(candidateYear));
    if (diff === 0) yearExact = true;
    else if (diff > 1) yearMismatch = true;
  }
  if (yearMismatch) return 0;

  let bestScore = 0;
  const candSize = candTokenSet.size;

  for (const hint of normalizedHints) {
    let baseScore = 0;
    if (candExact === hint.exact || (candNoArt && candNoArt === hint.noArt)) {
      baseScore = 100;
    } else if (hint.tokens.length >= 2 && candSize >= 2) {
      let matches = 0;
      for (const t of hint.tokens) {
        if (candTokenSet.has(t)) matches++;
      }
      const unionSize = hint.tokens.length + candSize - matches;
      const jaccard = unionSize > 0 ? matches / unionSize : 0;
      const hintCoverage = matches / hint.tokens.length;
      const candCoverage = matches / candSize;
      if (jaccard >= 0.84 && hintCoverage >= 0.85 && candCoverage >= 0.85) {
        baseScore = Math.round(78 + jaccard * 18);
      } else if (
        yearExact &&
        hintCoverage === 1 &&
        Math.abs(candSize - hint.tokens.length) <= 1 &&
        candSize >= 3
      ) {
        baseScore = 82;
      }
    }

    if (baseScore > 0) {
      const bonus = (yearExact ? 12 : 0) + (hint.idx === 0 ? 4 : 0);
      bestScore = Math.max(bestScore, baseScore + bonus);
    }
  }
  return bestScore;
}

async function loadUnifiedXtreamCatalogFast(timeoutMs = 2600): Promise<XtreamFullCatalogPayload | null> {
  const multiCatalogs = getAllCachedProviderCatalogs();
  const cachedMerged = unifiedCatalogRamCache.get('unified');
  if (
    cachedMerged &&
    cachedMerged.liveStreams.length > 0 &&
    multiCatalogs.length <= lastUnifiedMultiProviderCount
  ) {
    return cachedMerged;
  }

  const [runtimeSnap, envCatalogRes] = await Promise.all([
    getConnectedProvidersCatalogSnapshot(500).catch(() => null),
    isXtreamEnvConfigured()
      ? Promise.race([
          syncFullCatalog(false, 'all').catch(() => ({ ok: false as const })),
          new Promise<{ ok: false }>((resolve) => setTimeout(() => resolve({ ok: false }), timeoutMs)),
        ])
      : Promise.resolve({ ok: false as const }),
  ]);

  let envCat = envCatalogRes.ok && 'catalog' in envCatalogRes ? envCatalogRes.catalog : null;
  if (!envCat && isXtreamEnvConfigured()) {
    const partialCats = getCachedXtreamProviderCatalogs();
    if (partialCats.length > 0) {
      envCat = {
        providerId: 'all',
        providerName: 'Catálogo Parcial',
        liveCategories: partialCats.flatMap((c) => c.liveCategories),
        liveStreams: partialCats.flatMap((c) => c.liveStreams),
        vodCategories: partialCats.flatMap((c) => c.vodCategories),
        vodStreams: partialCats.flatMap((c) => c.vodStreams),
        seriesCategories: partialCats.flatMap((c) => c.seriesCategories),
        series: partialCats.flatMap((c) => c.series),
        counts: {
          liveCategories: 0,
          liveStreams: 0,
          vodCategories: 0,
          vodStreams: 0,
          seriesCategories: 0,
          series: 0,
        },
        accountNumber: 1,
        syncedAt: Date.now(),
        expiresAt: Date.now() + 60_000,
        fromCache: true,
      };
    }
  }
  const hasRuntimeItems =
    Boolean(runtimeSnap) &&
    (runtimeSnap!.movieItems.length > 0 ||
      runtimeSnap!.seriesItems.length > 0 ||
      runtimeSnap!.liveItems.length > 0);
  const hasMultiItems = multiCatalogs.some(
    (c) => c.liveStreams.length > 0 || c.vodStreams.length > 0 || c.seriesList.length > 0
  );

  if (!hasRuntimeItems && !envCat && !hasMultiItems) return null;
  if (!hasRuntimeItems && !hasMultiItems && envCat) {
    if (envCatalogRes.ok && envCat.liveStreams.length >= 200) {
      lastUnifiedMultiProviderCount = multiCatalogs.length;
      unifiedCatalogRamCache.set('unified', envCat);
    }
    return envCat;
  }

  const liveCategories: XtreamCategoryItem[] = [...(envCat?.liveCategories || [])];
  const vodCategories: XtreamCategoryItem[] = [...(envCat?.vodCategories || [])];
  const seriesCategories: XtreamCategoryItem[] = [...(envCat?.seriesCategories || [])];
  const liveStreams: XtreamLiveStreamItem[] = [...(envCat?.liveStreams || [])];
  const vodStreams: XtreamVodStreamItem[] = [...(envCat?.vodStreams || [])];
  const series: XtreamSeriesItem[] = [...(envCat?.series || [])];

  const seenLive = new Set(liveStreams.map((x) => `${x.providerId}:${x.streamId}`));
  const seenVod = new Set(vodStreams.map((x) => `${x.providerId}:${x.streamId}`));
  const seenSer = new Set(series.map((x) => `${x.providerId}:${x.seriesId}`));

  if (multiCatalogs.length > 0) {
    for (const cat of multiCatalogs) {
      const pid = cat.providerId;
      const pname = cat.providerName;
      for (const c of cat.liveCategories) {
        liveCategories.push({
          id: `${pid}:${c.id}`,
          providerId: pid,
          providerName: pname,
          name: c.name,
          type: 'live',
        });
      }
      for (const c of cat.vodCategories) {
        vodCategories.push({
          id: `${pid}:${c.id}`,
          providerId: pid,
          providerName: pname,
          name: c.name,
          type: 'vod',
        });
      }
      for (const c of cat.seriesCategories) {
        seriesCategories.push({
          id: `${pid}:${c.id}`,
          providerId: pid,
          providerName: pname,
          name: c.name,
          type: 'series',
        });
      }
      for (const item of cat.liveStreams) {
        const k = `${pid}:${item.streamId}`;
        if (seenLive.has(k)) continue;
        seenLive.add(k);
        liveStreams.push({
          num: liveStreams.length + 1,
          streamId: item.streamId,
          name: item.name,
          categoryId: `${pid}:${item.categoryId}`,
          streamIcon: item.logo,
          playbackUrl: item.playbackUrl,
          providerId: pid,
          providerName: pname,
        });
      }
      for (const item of cat.vodStreams) {
        const k = `${pid}:${item.streamId}`;
        if (seenVod.has(k)) continue;
        seenVod.add(k);
        vodStreams.push({
          num: vodStreams.length + 1,
          streamId: item.streamId,
          name: item.name,
          categoryId: `${pid}:${item.categoryId}`,
          streamIcon: item.poster,
          containerExtension: item.ext || 'mp4',
          rating: item.rating,
          added: item.year,
          playbackUrl: item.playbackUrl,
          providerId: pid,
          providerName: pname,
        });
      }
      for (const item of cat.seriesList) {
        const k = `${pid}:${item.seriesId}`;
        if (seenSer.has(k)) continue;
        seenSer.add(k);
        series.push({
          num: series.length + 1,
          seriesId: item.seriesId,
          name: item.name,
          categoryId: `${pid}:${item.categoryId}`,
          cover: item.poster,
          plot: item.plot,
          releaseDate: item.year,
          rating: item.rating,
          providerId: pid,
          providerName: pname,
        });
      }
    }
  }

  if (runtimeSnap) {
    const seenLiveCat = new Set<string>();
    const seenVodCat = new Set<string>();
    const seenSerCat = new Set<string>();
    for (const c of runtimeSnap.liveCategories) {
      liveCategories.push({ id: c.id, name: c.name, type: 'live' });
    }
    for (const c of runtimeSnap.movieCategories) {
      vodCategories.push({ id: c.id, name: c.name, type: 'vod' });
    }
    for (const c of runtimeSnap.seriesCategories) {
      seriesCategories.push({ id: c.id, name: c.name, type: 'series' });
    }
    for (const item of runtimeSnap.liveItems) {
      const k = `${item.providerId}:${item.streamId}`;
      if (seenLive.has(k)) continue;
      seenLive.add(k);
      const prefixedCat = `${item.providerId}:${item.categoryId}`;
      liveStreams.push({
        num: liveStreams.length + 1,
        streamId: item.streamId,
        name: item.name,
        categoryId: prefixedCat,
        streamIcon: item.poster,
        playbackUrl: item.streamUrl,
        providerId: item.providerId,
        providerName: item.providerName,
      });
      if (!seenLiveCat.has(prefixedCat)) {
        seenLiveCat.add(prefixedCat);
        liveCategories.push({
          id: prefixedCat,
          providerId: item.providerId,
          providerName: item.providerName,
          name: item.categoryName,
          type: 'live',
        });
      }
    }
    for (const item of runtimeSnap.movieItems) {
      const k = `${item.providerId}:${item.streamId}`;
      if (seenVod.has(k)) continue;
      seenVod.add(k);
      const prefixedCat = `${item.providerId}:${item.categoryId}`;
      vodStreams.push({
        num: vodStreams.length + 1,
        streamId: item.streamId,
        name: item.name,
        categoryId: prefixedCat,
        streamIcon: item.poster,
        containerExtension: item.containerExtension || 'mp4',
        rating: item.rating,
        added: item.year,
        playbackUrl: item.streamUrl,
        providerId: item.providerId,
        providerName: item.providerName,
      });
      if (!seenVodCat.has(prefixedCat)) {
        seenVodCat.add(prefixedCat);
        vodCategories.push({
          id: prefixedCat,
          providerId: item.providerId,
          providerName: item.providerName,
          name: item.categoryName,
          type: 'vod',
        });
      }
    }
    for (const item of runtimeSnap.seriesItems) {
      const k = `${item.providerId}:${item.streamId}`;
      if (seenSer.has(k)) continue;
      seenSer.add(k);
      const prefixedCat = `${item.providerId}:${item.categoryId}`;
      series.push({
        num: series.length + 1,
        seriesId: item.streamId,
        name: item.name,
        categoryId: prefixedCat,
        cover: item.poster,
        plot: item.plot,
        releaseDate: item.year,
        rating: item.rating,
        providerId: item.providerId,
        providerName: item.providerName,
      });
      if (!seenSerCat.has(prefixedCat)) {
        seenSerCat.add(prefixedCat);
        seriesCategories.push({
          id: prefixedCat,
          providerId: item.providerId,
          providerName: item.providerName,
          name: item.categoryName,
          type: 'series',
        });
      }
    }
  }

  const mergedPayload: XtreamFullCatalogPayload = {
    providerId: 'all',
    providerName: 'Catálogo Unificado',
    liveCategories,
    liveStreams,
    vodCategories,
    vodStreams,
    seriesCategories,
    series,
    counts: {
      liveCategories: liveCategories.length,
      liveStreams: liveStreams.length,
      vodCategories: vodCategories.length,
      vodStreams: vodStreams.length,
      seriesCategories: seriesCategories.length,
      series: series.length,
    },
    accountNumber: 1,
    syncedAt: envCat?.syncedAt ?? Date.now(),
    expiresAt: envCat?.expiresAt ?? Date.now() + 5 * 60 * 1000,
    fromCache: true,
  };
  if (mergedPayload.liveStreams.length >= 200) {
    lastUnifiedMultiProviderCount = multiCatalogs.length;
    unifiedCatalogRamCache.set('unified', mergedPayload);
  }
  return mergedPayload;
}

function buildCategoryLookup(
  cats: Array<{ id: string; providerId?: string; name: string }>
): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of cats) {
    const cleanName = c.name.replace(/^\[[^\]]+\]\s*/, '').trim();
    map.set(c.id, cleanName);
    if (c.providerId && !c.id.includes(':')) {
      map.set(`${c.providerId}:${c.id}`, cleanName);
    }
  }
  return map;
}

function toExtractorLang(lang: XtreamDetectedLang): string {
  return lang === 'INTL' ? 'EN' : lang;
}

function computeOptionSortKey(
  opt: XtreamMatchedMediaOption,
  preferLang?: string,
  preferQualityFirst?: boolean
): number {
  const normPref = String(preferLang || 'ES').toUpperCase();
  let langRank = 5;
  if (opt.lang === normPref) langRank = 0;
  else if (normPref === 'ES') {
    langRank =
      opt.lang === 'ES'
        ? 0
        : opt.lang === 'LAT'
        ? 1
        : opt.lang === 'VOSE'
        ? 2
        : opt.lang === 'EN'
        ? 3
        : opt.lang === 'AR'
        ? 7
        : 5;
  } else if (normPref === 'LAT') {
    langRank =
      opt.lang === 'LAT'
        ? 0
        : opt.lang === 'ES'
        ? 1
        : opt.lang === 'VOSE'
        ? 2
        : opt.lang === 'EN'
        ? 3
        : opt.lang === 'AR'
        ? 7
        : 5;
  } else if (normPref === 'EN') {
    langRank = opt.lang === 'EN' ? 0 : opt.lang === 'VOSE' ? 1 : opt.lang === 'ES' ? 2 : opt.lang === 'AR' ? 7 : 5;
  } else if (normPref === 'VOSE') {
    langRank = opt.lang === 'VOSE' ? 0 : opt.lang === 'EN' ? 1 : opt.lang === 'ES' ? 2 : opt.lang === 'AR' ? 7 : 5;
  }

  if (preferQualityFirst || normPref === 'QUALITY') {
    return (opt.lang === 'AR' && normPref !== 'AR' ? 8000 : 0) + opt.qualityTier * 1000 + langRank * 100 - Math.min(99, opt.score);
  }
  // Castellano/preferred language first, then best resolution (4K > 1080p > HD > SD)
  return langRank * 1000 + opt.qualityTier * 100 - Math.min(99, opt.score);
}

export async function findXtreamMovieMatches(params: {
  titleHints: string[];
  yearHint?: string;
  preferLang?: string;
  preferQualityFirst?: boolean;
  limit?: number;
}): Promise<{ options: XtreamMatchedMediaOption[]; tracks: TrackRecord[] }> {
  const hints = buildHintVectors(params.titleHints);
  if (hints.length === 0) return { options: [], tracks: [] };

  const catalog = await loadUnifiedXtreamCatalogFast(2800);
  if (!catalog || catalog.vodStreams.length === 0) {
    return { options: [], tracks: [] };
  }

  const movieIndex = getIndexedVodMovies(catalog);
  const candidateIndices = querySearchIndexCandidates(movieIndex, hints);
  const providerOrder = new Map(getAllXtreamProviders().map((p, idx) => [p.id, idx]));
  const matches: XtreamMatchedMediaOption[] = [];

  for (const idx of candidateIndices) {
    const entry = movieIndex.entries[idx];
    const score = scorePreindexedCandidate(
      entry.candExact,
      entry.candNoArt,
      entry.candTokenSet,
      entry.parsed.year,
      hints,
      params.yearHint
    );
    if (score < 76) continue;

    const item = entry.item;
    const pid = entry.pid;
    const ext = (item.containerExtension || 'mp4').toLowerCase();
    const playbackUrl =
      item.playbackUrl ||
      `/api/stream?provider=${encodeURIComponent(pid)}&id=${encodeURIComponent(item.streamId)}&type=vod&ext=${encodeURIComponent(ext)}`;

    matches.push({
      id: `xtream-vod-${pid}-${item.streamId}`,
      mediaType: 'movie',
      providerId: pid,
      providerName: item.providerName || pid,
      streamId: item.streamId,
      title: item.name,
      cleanTitle: entry.parsed.cleanTitle,
      year: entry.parsed.year,
      categoryName: entry.catName,
      lang: entry.parsed.lang,
      langLabel: entry.parsed.langLabel,
      quality: entry.parsed.quality,
      qualityTier: entry.parsed.qualityTier,
      containerExtension: ext,
      rating: item.rating,
      poster: item.streamIcon,
      playbackUrl,
      score,
    });
  }

  matches.sort((a, b) => {
    const keyDiff =
      computeOptionSortKey(a, params.preferLang, params.preferQualityFirst) -
      computeOptionSortKey(b, params.preferLang, params.preferQualityFirst);
    if (keyDiff !== 0) return keyDiff;
    return (providerOrder.get(a.providerId) ?? 99) - (providerOrder.get(b.providerId) ?? 99);
  });

  // Deduplicate exact same provider + lang + quality keeping highest match score
  const seenKey = new Set<string>();
  const deduped: XtreamMatchedMediaOption[] = [];
  for (const m of matches) {
    const key = `${m.providerId}|${m.lang}|${m.qualityTier}|${m.streamId}`;
    if (seenKey.has(key)) continue;
    seenKey.add(key);
    deduped.push(m);
    if (deduped.length >= (params.limit ?? 24)) break;
  }

  const tracks: TrackRecord[] = deduped.map((opt) => ({
    id: `xtream-vod-${opt.providerId}-${opt.streamId}`,
    label: `${opt.providerName} · ${opt.langLabel} · ${opt.quality}`,
    lang: toExtractorLang(opt.lang),
    quality: opt.quality,
    sourceUrl: opt.playbackUrl || '',
    resolvedStreamUrl: opt.playbackUrl || '',
    resolverType: opt.containerExtension === 'm3u8' ? 'direct_hls' : 'direct_mp4',
  }));

  return { options: deduped, tracks };
}

export async function findXtreamSeriesMatches(params: {
  titleHints: string[];
  yearHint?: string;
  preferLang?: string;
  preferQualityFirst?: boolean;
  limit?: number;
}): Promise<XtreamMatchedMediaOption[]> {
  const hints = buildHintVectors(params.titleHints);
  if (hints.length === 0) return [];

  const catalog = await loadUnifiedXtreamCatalogFast(2800);
  if (!catalog || catalog.series.length === 0) return [];

  const seriesIndex = getIndexedVodSeries(catalog);
  const candidateIndices = querySearchIndexCandidates(seriesIndex, hints);
  const providerOrder = new Map(getAllXtreamProviders().map((p, idx) => [p.id, idx]));
  const matches: XtreamMatchedMediaOption[] = [];

  for (const idx of candidateIndices) {
    const entry = seriesIndex.entries[idx];
    const score = scorePreindexedCandidate(
      entry.candExact,
      entry.candNoArt,
      entry.candTokenSet,
      entry.serYear,
      hints,
      params.yearHint
    );
    if (score < 76) continue;

    const ser = entry.item;
    const pid = entry.pid;
    matches.push({
      id: `xtream-ser-${pid}-${ser.seriesId}`,
      mediaType: 'tv',
      providerId: pid,
      providerName: ser.providerName || pid,
      streamId: ser.seriesId,
      seriesId: ser.seriesId,
      title: ser.name,
      cleanTitle: entry.parsed.cleanTitle,
      year: entry.serYear,
      categoryName: entry.catName,
      lang: entry.parsed.lang,
      langLabel: entry.parsed.langLabel,
      quality: entry.parsed.quality,
      qualityTier: entry.parsed.qualityTier,
      containerExtension: 'mp4',
      rating: ser.rating,
      poster: ser.cover,
      score,
    });
  }

  matches.sort((a, b) => {
    const keyDiff =
      computeOptionSortKey(a, params.preferLang, params.preferQualityFirst) -
      computeOptionSortKey(b, params.preferLang, params.preferQualityFirst);
    if (keyDiff !== 0) return keyDiff;
    return (providerOrder.get(a.providerId) ?? 99) - (providerOrder.get(b.providerId) ?? 99);
  });

  const seenKey = new Set<string>();
  const deduped: XtreamMatchedMediaOption[] = [];
  for (const m of matches) {
    const key = `${m.providerId}|${m.lang}|${m.seriesId}`;
    if (seenKey.has(key)) continue;
    seenKey.add(key);
    deduped.push(m);
    if (deduped.length >= (params.limit ?? 16)) break;
  }

  return deduped;
}

async function fetchCachedXtreamSeriesInfo(
  seriesId: string,
  providerId: string
): Promise<XtreamSeriesInfoPayload | null> {
  const key = `${providerId}:${seriesId}`;
  const cached = seriesInfoCache.get(key);
  if (cached) return cached;

  const provRes = await Promise.race([
    getProviderSeriesDetail(providerId, seriesId).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 3200)),
  ]);
  if (provRes && Array.isArray(provRes.seasons) && provRes.seasons.length > 0) {
    const mapped: XtreamSeriesInfoPayload = {
      seriesId: provRes.seriesId,
      providerId: provRes.providerId,
      providerName: provRes.providerName,
      title: provRes.title,
      name: provRes.title,
      cover: provRes.poster,
      plot: provRes.plot,
      genre: provRes.genre,
      releaseDate: provRes.year,
      rating: provRes.rating,
      seasons: provRes.seasons.map((s) => ({
        seasonNumber: s.seasonNumber,
        name: s.name,
        episodeCount: s.episodes.length,
        episodes: s.episodes.map((e) => ({
          id: e.id,
          episodeNum: e.episodeNum,
          seasonNum: e.season,
          title: e.title,
          containerExtension: e.containerExtension,
          duration: e.duration,
          plot: e.plot,
          cover: e.still,
          playbackUrl: e.streamUrl,
          providerId: provRes.providerId,
        })),
      })),
    };
    seriesInfoCache.set(key, mapped);
    return mapped;
  }

  const res = await Promise.race([
    getSeriesInfo(seriesId, providerId).catch(() => ({ ok: false as const })),
    new Promise<{ ok: false }>((resolve) => setTimeout(() => resolve({ ok: false }), 3200)),
  ]);
  if (res.ok && 'info' in res && res.info) {
    seriesInfoCache.set(key, res.info);
    return res.info;
  }
  return null;
}

export async function extractXtreamSeriesEpisodeTracks(params: {
  titleHints: string[];
  yearHint?: string;
  season: number;
  episode: number;
  preferLang?: string;
  preferQualityFirst?: boolean;
}): Promise<TrackRecord[]> {
  const seriesOptions = await findXtreamSeriesMatches({
    titleHints: params.titleHints,
    yearHint: params.yearHint,
    preferLang: params.preferLang,
    preferQualityFirst: params.preferQualityFirst,
    limit: 6,
  });
  if (seriesOptions.length === 0) return [];

  const infos = await Promise.all(
    seriesOptions.map(async (opt) => ({
      opt,
      info: await fetchCachedXtreamSeriesInfo(opt.seriesId || opt.streamId, opt.providerId),
    }))
  );

  const tracks: TrackRecord[] = [];
  for (const { opt, info } of infos) {
    if (!info || !Array.isArray(info.seasons)) continue;
    const seasonGrp = info.seasons.find((s) => s.seasonNumber === params.season);
    const ep: XtreamSeriesEpisodeItem | undefined = seasonGrp?.episodes?.find(
      (e) => e.episodeNum === params.episode
    );
    if (!ep?.playbackUrl) continue;

    const epParsed = parseXtreamVodTitleMeta(
      `${opt.title} ${ep.title || ''}`,
      opt.categoryName,
      ep.containerExtension
    );
    const effectiveLang = epParsed.lang !== 'INTL' ? epParsed.lang : opt.lang;
    const effectiveLangLabel = epParsed.lang !== 'INTL' ? epParsed.langLabel : opt.langLabel;
    const bestQualityTier = Math.min(opt.qualityTier, epParsed.qualityTier);
    const bestQualityLabel =
      bestQualityTier === 0
        ? '4K UHD'
        : bestQualityTier === 1
        ? '1080p FHD'
        : bestQualityTier === 2
        ? 'HD'
        : opt.quality;

    tracks.push({
      id: `xtream-ser-${opt.providerId}-${ep.id}`,
      label: `${opt.providerName} · ${effectiveLangLabel} · ${bestQualityLabel}`,
      lang: toExtractorLang(effectiveLang),
      quality: bestQualityLabel,
      sourceUrl: ep.playbackUrl,
      resolvedStreamUrl: ep.playbackUrl,
      resolverType: ep.containerExtension === 'm3u8' ? 'direct_hls' : 'direct_mp4',
    });
  }

  return tracks;
}

export function mergeXtreamOptionsIntoAvailableLanguages(
  existing: ('ES' | 'LAT' | 'VOSE' | 'EN')[],
  options: XtreamMatchedMediaOption[]
): ('ES' | 'LAT' | 'VOSE' | 'EN')[] {
  const validCoreLangs = new Set<'ES' | 'LAT' | 'VOSE' | 'EN'>(['ES', 'LAT', 'VOSE', 'EN']);
  const merged = new Set<'ES' | 'LAT' | 'VOSE' | 'EN'>(existing);
  for (const opt of options) {
    if (validCoreLangs.has(opt.lang as 'ES' | 'LAT' | 'VOSE' | 'EN')) {
      merged.add(opt.lang as 'ES' | 'LAT' | 'VOSE' | 'EN');
    }
  }
  const order: Array<'ES' | 'LAT' | 'VOSE' | 'EN'> = ['ES', 'LAT', 'VOSE', 'EN'];
  return order.filter((code) => merged.has(code));
}

const LIVE_BROADCASTER_ALIASES: Array<{ re: RegExp; patterns: string[] }> = [
  { re: /\bla\s*1\b|\btve\s*1\b/i, patterns: ['la 1', 'tve 1', 'tve1', 'la1'] },
  { re: /\bla\s*2\b|\btve\s*2\b/i, patterns: ['la 2', 'tve 2', 'tve2', 'la2'] },
  { re: /\bantena\s*3\b/i, patterns: ['antena 3', 'antena3', 'a3'] },
  { re: /\bcuatro\b/i, patterns: ['cuatro'] },
  { re: /\btelecinco\b|\btele\s*5\b/i, patterns: ['telecinco', 'tele 5', 't5'] },
  { re: /\bla\s*sexta\b|\blasexta\b/i, patterns: ['lasexta', 'la sexta'] },
  { re: /\bneox\b/i, patterns: ['neox'] },
  { re: /\bnova\b/i, patterns: ['nova'] },
  { re: /\bmega\b/i, patterns: ['mega'] },
  { re: /\batreseries\b|\ba3s\b/i, patterns: ['atreseries', 'a3s', 'atres series'] },
  { re: /\bfdf\b|factor[ií]a\s*de\s*ficci[oó]n/i, patterns: ['fdf', 'factoria de ficcion'] },
  { re: /\benergy\b/i, patterns: ['energy'] },
  { re: /\bdivinity\b/i, patterns: ['divinity'] },
  { re: /\bbe\s*mad\b|\bbemad\b/i, patterns: ['be mad', 'bemad'] },
  { re: /\bboing\b/i, patterns: ['boing'] },
  { re: /\bclan\b/i, patterns: ['clan', 'clan tve', 'clan rtve'] },
  { re: /\bdmax\b/i, patterns: ['dmax', 'discovery max'] },
  { re: /\bdkiss\b/i, patterns: ['dkiss', 'd kiss'] },
  { re: /\bten\b/i, patterns: ['ten', 'ten tv'] },
  { re: /\btrece\b|\b13\s*tv\b/i, patterns: ['trece', 'trece tv', '13 tv', '13tv'] },
  { re: /\b24\s*h\b|\b24\s*horas\b/i, patterns: ['24h', '24 horas', 'canal 24 horas', 'tve 24h'] },
  { re: /\bd\s*sports\b|\bdirectv\s*sports?\b/i, patterns: ['dsports', 'directv sports', 'directv sport', 'd sports'] },
  { re: /\btudn\b/i, patterns: ['tudn', 'tudn mx', 'tudn usa'] },
  { re: /\bdazn\s*laliga\b/i, patterns: ['dazn laliga', 'dazn la liga'] },
  { re: /\bm\+\s*laliga\b|\bmovistar\s*laliga\b|\blaliga\s*tv\b/i, patterns: ['m+ laliga', 'movistar laliga', 'm laliga', 'laliga tv', 'laliga'] },
  { re: /campeones|mligacampeones|liga\s*de\s*campeones/i, patterns: ['liga de campeones', 'm campeones', 'm+ campeones', 'movistar campeones', 'm+ liga de campeones', 'l campeones', 'mligacampeones'] },
  { re: /hypermotion/i, patterns: ['laliga hypermotion', 'hypermotion', 'laliga tv hypermotion'] },
  { re: /\bmovistar\s*plus\b|\bm\+\s*plus\b/i, patterns: ['movistar plus', 'm+ plus', 'movistar+'] },
  { re: /\btyc\s*sports?\b/i, patterns: ['tyc sports', 'tyc sport'] },
  { re: /\btnt\s*sports?\b/i, patterns: ['tnt sports', 'tnt sport'] },
  { re: /\bfox\s*sports?\b/i, patterns: ['fox sports', 'fox sport'] },
  { re: /\bteledeporte\b|\btdp\b/i, patterns: ['teledeporte', 'tdp'] },
  { re: /\bcgtn\b/i, patterns: ['cgtn', 'cgtn espanol', 'cgtn noticias', 'cgtn esp'] },
];

const AMBIGUOUS_TDT_HOMONYM_RE =
  /^(?:ten|mega|nova|energy|fdf|clan|boing|cuatro|trece|24h|24\s*h|la\s*1|la\s*2|neox|divinity|dmax|dkiss)$/i;

const KNOWN_SPORTS_BROADCASTER_HINT_RE =
  /\b(?:dsports|directv|tudn|dazn|movistar|m\+\s*(?:liga|laliga|campeones|deportes|vamos|plus)|mliga(?:campeones)?|liga\s*de\s*campeones|campeones|laliga|hypermotion|espn|tyc\s*sports?|fox\s*sports?|tnt\s*sports?|sky\s*sports?|bein|gol\s*(?:play|tv|mundial)|teledeporte|eurosport|vamos|sport\s*tv|cgtn|la\s*1|la\s*2|antena\s*3|cuatro|telecinco|lasexta|la\s*sexta|neox|nova|mega|atreseries|fdf|energy|divinity|be\s*mad|bemad|boing|clan|24h|dmax|dkiss|ten|trece)\b/i;

export function extractXtreamLiveHintsFromSportsRequest(
  rawUrl: string,
  channelLabel?: string,
  titleHint?: string
): string[] {
  const hints: string[] = [];
  const add = (val: string) => {
    const c = String(val || '')
      .replace(
        /\b(?:señal|signal|canal|channel|opci[oó]n|enlace|servidor|server|link|mirror|live|fhd|hd|uhd|4k|1080p|720p|sd|directo|español|espanol|english|ofic?ial|guía\s*tv)\b/gi,
        ' '
      )
      .replace(/[|·•\-()[\]]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (c.length >= 3 && !/^\d+$/.test(c) && !hints.includes(c)) {
      hints.push(c);
    }
  };
  if (channelLabel) {
    const cleaned = String(channelLabel)
      .replace(
        /\b(?:señal|signal|canal|channel|opci[oó]n|enlace|servidor|server|link|mirror|live|fhd|hd|uhd|4k|1080p|720p|sd|directo|español|espanol|english|ofic?ial|guía\s*tv)\b/gi,
        ' '
      )
      .trim();
    if (cleaned.length >= 3 && KNOWN_SPORTS_BROADCASTER_HINT_RE.test(channelLabel)) {
      add(channelLabel);
    }
  }
  try {
    const u = new URL(rawUrl, 'http://localhost');
    const qStream = u.searchParams.get('stream') || u.searchParams.get('ch') || u.searchParams.get('channel') || '';
    if (qStream && KNOWN_SPORTS_BROADCASTER_HINT_RE.test(qStream.replace(/[_-]+/g, ' '))) {
      add(qStream.replace(/[_-]+/g, ' '));
    }
    const pathSlug = u.pathname.split('/').pop()?.replace(/\.(php|html?|m3u8)$/i, '') || '';
    if (
      pathSlug &&
      !/^(live\d*|stream|index|play|embed|canal\d*)$/i.test(pathSlug) &&
      KNOWN_SPORTS_BROADCASTER_HINT_RE.test(pathSlug.replace(/[_-]+/g, ' '))
    ) {
      add(pathSlug.replace(/[_-]+/g, ' '));
    }
  } catch {
    // ignore URL parse error
  }
  if (titleHint && KNOWN_SPORTS_BROADCASTER_HINT_RE.test(titleHint)) {
    add(titleHint);
  }
  return hints;
}

interface IndexedXtreamLiveChannel {
  item: XtreamLiveStreamItem;
  catName: string;
  meta: ParsedXtreamVodMeta;
  candNorm: string;
  candNum?: string;
  qualityBonus: number;
}

let cachedLiveIndexSource: XtreamLiveStreamItem[] | null = null;
let cachedLiveIndexBuiltAt = 0;
let cachedLiveIndex: IndexedXtreamLiveChannel[] = [];
let cachedLiveTokenMap = new Map<string, number[]>();

function getIndexedLiveStreams(catalog: XtreamFullCatalogPayload): IndexedXtreamLiveChannel[] {
  const now = Date.now();
  if (
    cachedLiveIndexSource === catalog.liveStreams &&
    now - cachedLiveIndexBuiltAt < 45_000 &&
    cachedLiveIndex.length > 0
  ) {
    return cachedLiveIndex;
  }
  const catLookup = buildCategoryLookup(catalog.liveCategories);
  const built: IndexedXtreamLiveChannel[] = [];
  const tokenMap = new Map<string, number[]>();
  for (const item of catalog.liveStreams) {
    const catName =
      catLookup.get(item.categoryId) ||
      catLookup.get(`${item.providerId}:${item.categoryId}`) ||
      'Live';
    const meta = parseXtreamVodTitleMeta(item.name, catName, 'm3u8');
    const candNorm = normalizeMatchText(meta.cleanTitle, false);
    if (!candNorm || /\b(?:backup|test|event|vod)\b/.test(candNorm)) continue;
    const candNum = candNorm.match(/\b(\d{1,2})\b$/)?.[1];
    const idx = built.length;
    built.push({
      item,
      catName,
      meta,
      candNorm,
      candNum,
      qualityBonus: Math.max(0, 12 - meta.qualityTier * 4),
    });
    for (const tok of candNorm.split(' ')) {
      if (tok.length >= 2) appendIndexKey(tokenMap, tok, idx);
    }
  }
  cachedLiveIndexSource = catalog.liveStreams;
  cachedLiveIndexBuiltAt = now;
  cachedLiveIndex = built;
  cachedLiveTokenMap = tokenMap;
  return built;
}

export async function findXtreamLiveChannelMatches(params: {
  channelHints: string[];
  preferLang?: string;
  preferQualityFirst?: boolean;
  limit?: number;
}): Promise<TrackRecord[]> {
  const rawHints = params.channelHints.map((h) => String(h || '').trim()).filter((h) => h.length >= 3);
  if (rawHints.length === 0) return [];

  const catalog = await loadUnifiedXtreamCatalogFast(1800);
  if (!catalog || catalog.liveStreams.length === 0) return [];

  const expandedPatterns: Array<{ norm: string; tokens: string[]; numberSuffix?: string }> = [];
  const seenPat = new Set<string>();
  const registerPat = (raw: string, forcedNum?: string) => {
    let norm = normalizeMatchText(raw, false);
    if (!norm || norm.length < 3) return;
    if (forcedNum && forcedNum !== '1') {
      const existingNum = norm.match(/\b(\d{1,2})\b$/)?.[1];
      if (!existingNum) norm = `${norm} ${forcedNum}`;
    }
    if (seenPat.has(norm)) return;
    seenPat.add(norm);
    const numMatch = norm.match(/\b(\d{1,2})\b$/);
    expandedPatterns.push({
      norm,
      tokens: norm.split(' ').filter((t) => t.length >= 2),
      numberSuffix: numMatch ? numMatch[1] : undefined,
    });
  };

  for (const h of rawHints) {
    const hNorm = normalizeMatchText(h, false);
    const hintNum = hNorm.match(/\b(\d{1,2})\b$/)?.[1];
    registerPat(h);
    for (const alias of LIVE_BROADCASTER_ALIASES) {
      if (alias.re.test(h)) {
        for (const p of alias.patterns) {
          registerPat(p, hintNum);
        }
      }
    }
  }

  const hintJoined = rawHints.join(' ').toLowerCase();
  const conflictChecks: Array<{ reqRe: RegExp; candRe: RegExp }> = [
    { reqRe: /\btnt\b/i, candRe: /\btnt\s*sports?\b/i },
    { reqRe: /\bespn\b/i, candRe: /\bespn\b/i },
    { reqRe: /\bdsports\b|\bdirectv\b/i, candRe: /\b(?:dsports|directv\s*sports?)\b/i },
    { reqRe: /\bdazn\b/i, candRe: /\bdazn\b/i },
    { reqRe: /\beurosport\b/i, candRe: /\beurosport\b/i },
    { reqRe: /\bsky\b/i, candRe: /\bsky\s*sports?\b/i },
    { reqRe: /\bbein\b/i, candRe: /\bbein\b/i },
    { reqRe: /\bfox\b/i, candRe: /\bfox\s*sports?\b/i },
    { reqRe: /\bgol\b/i, candRe: /\bgol\s*(?:play|tv|mundial)\b/i },
  ];

  const containsWholePhrase = (haystack: string, needle: string): boolean => {
    if (!haystack || !needle) return false;
    if (haystack === needle) return true;
    let pos = haystack.indexOf(needle);
    while (pos !== -1) {
      const beforeOk = pos === 0 || haystack[pos - 1] === ' ';
      const afterIdx = pos + needle.length;
      const afterOk = afterIdx === haystack.length || haystack[afterIdx] === ' ';
      if (beforeOk && afterOk) return true;
      pos = haystack.indexOf(needle, pos + 1);
    }
    return false;
  };

  const indexed = getIndexedLiveStreams(catalog);
  const candidateIdxSet = new Set<number>();
  for (const pat of expandedPatterns) {
    const patTokens = pat.norm.split(' ').filter((t) => t.length >= 2);
    let pickedList: number[] | null = null;
    for (const tok of patTokens) {
      if (/^\d+$/.test(tok)) continue;
      const list = cachedLiveTokenMap.get(tok);
      if (list && (!pickedList || list.length < pickedList.length)) {
        pickedList = list;
      }
    }
    if (pickedList) {
      for (const idx of pickedList) candidateIdxSet.add(idx);
    } else {
      for (const tok of patTokens) {
        const list = cachedLiveTokenMap.get(tok);
        if (list) for (const idx of list) candidateIdxSet.add(idx);
      }
    }
  }
  const entriesToScan =
    candidateIdxSet.size > 0
      ? Array.from(candidateIdxSet, (i) => indexed[i])
      : indexed;

  const scored: Array<{ item: XtreamLiveStreamItem; meta: ParsedXtreamVodMeta; score: number }> = [];
  const normPref = String(params.preferLang || 'ES').toUpperCase();

  const isAmbiguousTdtQuery = expandedPatterns.some((p) => AMBIGUOUS_TDT_HOMONYM_RE.test(p.norm));

  for (const entry of entriesToScan) {
    const { item, catName, meta, candNorm, candNum, qualityBonus } = entry;
    if (/\brsi\b/.test(candNorm) && !/\brsi\b/.test(hintJoined)) continue;

    if (isAmbiguousTdtQuery) {
      const hasSpanishTag =
        meta.lang === 'ES' ||
        /\b(?:es|esp|spain|espa[nñ]a|tdt|castellano)\b/i.test(`${catName} ${item.name}`);
      const hasNonSpanishNoise =
        /\b(?:sports?|india|greece|greek|turkey|turk|arab|latino|mexico|argentina|colombia|usa|uk|france|italia|germany|portugal|brazil|brasil|czech|nrj|poland|romania)\b/i.test(
          `${catName} ${item.name}`
        );
      if (!hasSpanishTag || hasNonSpanishNoise) continue;
    }

    // Reject conflicting sports broadcasters unless explicitly present in request hints
    let hasBroadcasterConflict = false;
    for (const chk of conflictChecks) {
      if (chk.candRe.test(candNorm) && !chk.reqRe.test(hintJoined)) {
        hasBroadcasterConflict = true;
        break;
      }
    }
    if (hasBroadcasterConflict) continue;

    let bestPatScore = 0;
    for (const pat of expandedPatterns) {
      if (candNorm === pat.norm) {
        bestPatScore = Math.max(bestPatScore, 130);
        continue;
      }
      if (pat.numberSuffix) {
        // Explicit channel number (e.g. "M+ Liga de Campeones 3" or "DAZN 2") MUST match that number
        if (pat.numberSuffix === '1') {
          if (candNum && candNum !== '1') continue;
        } else if (candNum !== pat.numberSuffix) {
          continue;
        }
      } else if (candNum && candNum !== '1') {
        // Unnumbered request ("M+ Liga de Campeones", "ESPN", "DAZN LaLiga") MUST NEVER match sub-channels 2..99 (including 10..16!)
        continue;
      }

      if (containsWholePhrase(candNorm, pat.norm)) {
        bestPatScore = Math.max(bestPatScore, pat.numberSuffix ? 115 : 102);
      } else if (pat.tokens.length >= 2 && pat.tokens.every((t) => containsWholePhrase(candNorm, t))) {
        bestPatScore = Math.max(bestPatScore, 92);
      }
    }
    if (bestPatScore < 85) continue;

    const langBonus = params.preferQualityFirst
      ? meta.lang === normPref
        ? 8
        : meta.lang === 'ES'
        ? 5
        : 0
      : meta.lang === normPref
      ? 30
      : meta.lang === 'ES' || meta.lang === 'LAT'
      ? 18
      : meta.lang === 'EN'
      ? 8
      : 0;
    const effectiveQualityBonus = params.preferQualityFirst ? qualityBonus * 3 : qualityBonus;
    const isSharkLjli =
      String(item.providerId || '').toLowerCase() === 'shark-pro' &&
      /spain\s*[-_]\s*(?:ljli|أسبانيا|اسبانيا)/i.test(catName);
    const curatedLjliBonus = isSharkLjli
      ? /\b(FHD|1080P?|4K|UHD)\b/i.test(item.name)
        ? 45
        : 30
      : /spain\s*[-_]\s*(?:ljli|أسبانيا|اسبانيا)/i.test(catName)
      ? 12
      : 0;
    scored.push({
      item,
      meta,
      score: bestPatScore + langBonus + effectiveQualityBonus + curatedLjliBonus,
    });
  }

  scored.sort((a, b) => b.score - a.score || a.meta.qualityTier - b.meta.qualityTier);

  const out: TrackRecord[] = [];
  const seenStreams = new Set<string>();
  const perProviderCount = new Map<string, number>();
  const maxItems = params.limit ?? 16;
  const maxPerProv = maxItems >= 12 ? 3 : 2;
  // Pass 1: diversify across ALL providers first (up to maxPerProv per provider)
  for (const entry of scored) {
    const pid = entry.item.providerId || 'primary';
    const dedupKey = `${pid}:${entry.item.streamId}`;
    if (seenStreams.has(dedupKey)) continue;
    const provCnt = perProviderCount.get(pid) || 0;
    if (provCnt >= maxPerProv) continue;
    seenStreams.add(dedupKey);
    perProviderCount.set(pid, provCnt + 1);
    out.push({
      id: `xtream-live-${pid}-${entry.item.streamId}`,
      label: `${entry.item.name} (${entry.item.providerName})`,
      lang: toExtractorLang(entry.meta.lang),
      quality: entry.meta.quality,
      sourceUrl: entry.item.playbackUrl,
      resolvedStreamUrl: entry.item.playbackUrl,
      resolverType: 'direct_hls',
      providerId: pid,
      providerName: entry.item.providerName,
    } as TrackRecord);
    if (out.length >= maxItems) break;
  }

  // Pass 2: fill any remaining slots up to maxItems if fewer providers matched
  if (out.length < maxItems) {
    for (const entry of scored) {
      const pid = entry.item.providerId || 'primary';
      const dedupKey = `${pid}:${entry.item.streamId}`;
      if (seenStreams.has(dedupKey)) continue;
      seenStreams.add(dedupKey);
      out.push({
        id: `xtream-live-${pid}-${entry.item.streamId}`,
        label: `${entry.item.name} (${entry.item.providerName})`,
        lang: toExtractorLang(entry.meta.lang),
        quality: entry.meta.quality,
        sourceUrl: entry.item.playbackUrl,
        resolvedStreamUrl: entry.item.playbackUrl,
        resolverType: 'direct_hls',
        providerId: pid,
        providerName: entry.item.providerName,
      } as TrackRecord);
      if (out.length >= maxItems) break;
    }
  }

  return out;
}

