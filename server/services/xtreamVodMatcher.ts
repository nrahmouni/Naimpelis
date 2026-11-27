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
  resolveUpstreamVodOrSeriesUrl,
  syncFullCatalog,
  type XtreamFullCatalogPayload,
  type XtreamSeriesEpisodeItem,
  type XtreamSeriesInfoPayload,
  type XtreamSeriesItem,
  type XtreamVodStreamItem,
} from './xtreamService.ts';
import {
  getConnectedProvidersMovieAndSeriesCatalogs,
  resolveProviderVodOrSeriesUrl,
} from './providers/xtreamProvidersService.ts';

export type XtreamDetectedLang =
  | 'ES'
  | 'LAT'
  | 'VOSE'
  | 'EN'
  | 'AR'
  | 'FR'
  | 'PT'
  | 'IT'
  | 'DE'
  | 'CAT';

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
const vodProbeResultCache = new LruTtlCache<
  string,
  { ok: boolean; target: ParsedInternalXtreamVodTarget | null }
>(400, 90 * 1000);
const inFlightVodProbeMap = new Map<
  string,
  Promise<{ ok: boolean; target: ParsedInternalXtreamVodTarget | null }>
>();

const LANG_LABEL_MAP: Record<XtreamDetectedLang, string> = {
  ES: 'Castellano',
  LAT: 'Latino',
  VOSE: 'VOSE',
  EN: 'Inglés (EN)',
  AR: 'Árabe (AR)',
  FR: 'Francés (FR)',
  PT: 'Portugués',
  IT: 'Italiano',
  DE: 'Alemán',
  CAT: 'Català',
};

const LEADING_PREFIX_TAG_RE =
  /^(?:\|\s*[A-Z0-9]{1,6}(?:-[A-Z0-9]{1,6})*\s*\|\s*|\[\s*(?:ES|ESP|SPAIN|ESPA[ÑN]A|CAST|CASTELLANO|LAT|LATINO|MX|LA|VOSE|VO|SUBS?|EN|ENG|ENGLISH|UK|US|USA|AR|ARB|ARABIC|FR|VF|VOSTFR|PT|IT|DE|GER|CAT|4K|UHD|FHD|HD|HDR|DV|VIP|TOP|MULTI|DUAL)(?:-[A-Z0-9]{1,6})*\s*\]\s*[:|\-/·•]*\s*|(?:ES|ESP|SPAIN|ESPA[ÑN]A|CAST|CASTELLANO|LAT|LATINO|MX|LA|VOSE|VO|SUBS?|EN|ENG|ENGLISH|UK|US|USA|AR|ARB|ARABIC|FR|VF|VOSTFR|PT|IT|DE|GER|CAT|4K|UHD|FHD|HD|HDR|DV|VIP|TOP|MULTI|DUAL)(?:-(?:4K|UHD|FHD|HD|ES|ESP|CAST|LAT|VOSE|VO|EN|FR|IT|DE|PT|AR|CAT|HDR|DV|[A-Z0-9]{1,3}))*\s*[:|\-/·•]+\s*)+/i;

const QUALITY_AND_EXT_TAG_RE =
  /(?:\(|\[)?\b(?:4K|UHD|2160P?|1080P?|FHD|FULL\s*HD|720P?|HDR10?\+?|DOLBY\s*VISION|REMUX|BLURAY|BLU-RAY|BDRIP|BRRIP|WEB-?DL|WEBRIP|HDTV|HDRIP|DVDRIP|480P?|360P?|HEVC|H\.?265|H\.?264|X265|X264|MULTI|DUAL|VOSE|CASTELLANO|LATINO|SUBTITULAD[AO]|MKV|MP4|AVI)\b(?:\)|\])?/gi;

export function detectXtreamQuality(
  rawName: string,
  categoryName = '',
  containerExt = ''
): { quality: string; qualityTier: number } {
  const hay = `${rawName} ${categoryName} ${containerExt}`.toLowerCase();
  if (/\b(?:4k|uhd|2160p?|dolby\s*vision|hdr10?\+?|remux)\b/.test(hay)) {
    return { quality: '4K UHD', qualityTier: 0 };
  }
  if (/\b(?:1080p?|fhd|full\s*hd|blu-?ray|bdrip)\b/.test(hay)) {
    return { quality: '1080p FHD', qualityTier: 1 };
  }
  if (/\b(?:720p?|hdtv|web-?dl|webrip|hdrip|hd)\b/.test(hay)) {
    return { quality: 'HD', qualityTier: 2 };
  }
  if (/\b(?:480p?|dvdrip)\b/.test(hay)) {
    return { quality: '480p', qualityTier: 3 };
  }
  if (/\b(?:360p?|sd|cam|ts)\b/.test(hay)) {
    return { quality: 'SD', qualityTier: 4 };
  }
  return { quality: '1080p FHD', qualityTier: 1 };
}

export function detectXtreamLanguage(
  rawName: string,
  categoryName = ''
): { lang: XtreamDetectedLang; langLabel: string } {
  const name = String(rawName || '').trim();
  const cat = String(categoryName || '').trim();
  const combined = `${name} ${cat}`;

  if (/[\u0600-\u06FF]/.test(combined) || /^(?:AR|ARB)\s*[:|\-/]/i.test(name) || /\b(?:arabic|arabia|egypt|maroc|morocco|aflam)\b/i.test(cat)) {
    return { lang: 'AR', langLabel: LANG_LABEL_MAP.AR };
  }
  if (/^(?:CAT)\s*[:|\-/]/i.test(name) || /\b(?:catal[aà]|3cat|tv3)\b/i.test(combined)) {
    return { lang: 'CAT', langLabel: LANG_LABEL_MAP.CAT };
  }
  if (/\b(?:vose|subtitulad[ao]s?|sub\s*es|sub\s*esp|mult\s*sub)\b/i.test(combined)) {
    return { lang: 'VOSE', langLabel: LANG_LABEL_MAP.VOSE };
  }
  if (
    /^(?:LAT|LA|MX)\s*[:|\-/]/i.test(name) ||
    /\b(?:latino|latam|audio\s*latino|es-mx|m[eé]xico|argentina|colombia)\b/i.test(combined)
  ) {
    return { lang: 'LAT', langLabel: LANG_LABEL_MAP.LAT };
  }
  if (
    /^(?:\|?\s*)?(?:ES|ESP|SPAIN|ESPA[ÑN]A|CAST)(?:\s*\||\s*[:|\-/])/i.test(name) ||
    /(?:^|[|\s\-/])(?:4K|UHD|FHD|HD)-(?:ES|ESP|CAST)\b|(?:^|[|\s\-/])(?:ES|ESP|CAST)-(?:4K|UHD|FHD|HD)\b/i.test(name) ||
    /\b(?:castellano|espa[ñn]a|spain|esp|cine\s*es|pel[ií]culas\s*es|series\s*es|estrenos\s*es|multi\s*es)\b/i.test(combined)
  ) {
    return { lang: 'ES', langLabel: LANG_LABEL_MAP.ES };
  }
  if (
    /^(?:\|?\s*)?(?:FR|VF|VOSTFR)(?:\s*\||\s*[:|\-/])/i.test(name) ||
    /\b(?:french|fran[çc]ais|france|vostfr)\b/i.test(combined)
  ) {
    return { lang: 'FR', langLabel: LANG_LABEL_MAP.FR };
  }
  if (/^(?:\|?\s*)?(?:PT|BR)(?:\s*\||\s*[:|\-/])/i.test(name) || /\b(?:portugu[eê]s|portugal|brasil)\b/i.test(combined)) {
    return { lang: 'PT', langLabel: LANG_LABEL_MAP.PT };
  }
  if (/^(?:\|?\s*)?(?:IT)(?:\s*\||\s*[:|\-/])/i.test(name) || /\b(?:italiano|italy|italia)\b/i.test(combined)) {
    return { lang: 'IT', langLabel: LANG_LABEL_MAP.IT };
  }
  if (/^(?:\|?\s*)?(?:DE|GER)(?:\s*\||\s*[:|\-/])/i.test(name) || /\b(?:german|deutsch|allemand)\b/i.test(combined)) {
    return { lang: 'DE', langLabel: LANG_LABEL_MAP.DE };
  }
  if (
    /^(?:\|?\s*)?(?:EN|ENG|UK|US|USA)(?:\s*\||\s*[:|\-/])/i.test(name) ||
    /\b(?:english|ingl[eé]s|4k\s*movies|en\s*4k|netflix|apple\s*tv|prime\s*video|disney|marvel|animation|horror|action|drama|comedy|thriller|sci-?fi|top\s*imdb)\b/i.test(cat)
  ) {
    return { lang: 'EN', langLabel: LANG_LABEL_MAP.EN };
  }
  if (/\b(?:pel[ií]culas|cine|series|estrenos|infantil|animaci[oó]n|acci[oó]n|comedia|terror|suspense|ciencia\s*ficci[oó]n|español)\b/i.test(cat)) {
    return { lang: 'ES', langLabel: LANG_LABEL_MAP.ES };
  }
  return { lang: 'EN', langLabel: LANG_LABEL_MAP.EN };
}

export function parseXtreamVodTitleMeta(
  rawName: string,
  categoryName = '',
  containerExtension = ''
): ParsedXtreamVodMeta {
  let work = String(rawName || '').replace(/\s+/g, ' ').trim();
  const yearMatches = Array.from(work.matchAll(/(?:\(|\b)(19\d{2}|20[0-3]\d)(?:\)|\b)/g));
  const year = yearMatches.length > 0 ? yearMatches[yearMatches.length - 1][1] : undefined;

  work = work.replace(LEADING_PREFIX_TAG_RE, '').trim();
  work = work.replace(/\((19\d{2}|20[0-3]\d)\)/g, ' ');
  work = work.replace(/\[(19\d{2}|20[0-3]\d)\]/g, ' ');
  work = work.replace(QUALITY_AND_EXT_TAG_RE, ' ');
  if (year) {
    work = work.replace(new RegExp(`\\b${year}\\b$`), ' ');
  }
  work = work
    .replace(/\[\s*\]|\(\s*\)/g, ' ')
    .replace(/^[\s\-–:|•·/]+|[\s\-–:|•·/]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const { lang, langLabel } = detectXtreamLanguage(rawName, categoryName);
  const { quality, qualityTier } = detectXtreamQuality(rawName, categoryName, containerExtension);

  return {
    cleanTitle: work || String(rawName || '').trim(),
    year,
    lang,
    langLabel,
    quality,
    qualityTier,
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

function scoreTitleMatchAgainstHints(
  candidateCleanTitle: string,
  candidateYear: string | undefined,
  normalizedHints: Array<{ exact: string; noArt: string; tokens: string[]; idx: number }>,
  yearHint?: string
): number {
  const candExact = normalizeMatchText(candidateCleanTitle, false);
  const candNoArt = normalizeMatchText(candidateCleanTitle, true);
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
  const candTokens = tokenizeMeaningful(candidateCleanTitle);
  const candTokenSet = new Set(candTokens);

  for (const hint of normalizedHints) {
    let baseScore = 0;
    if (candExact === hint.exact || (candNoArt && candNoArt === hint.noArt)) {
      baseScore = 100;
    } else if (hint.tokens.length >= 2 && candTokens.length >= 2) {
      let matches = 0;
      for (const t of hint.tokens) {
        if (candTokenSet.has(t)) matches++;
      }
      const unionSize = new Set([...hint.tokens, ...candTokens]).size;
      const jaccard = unionSize > 0 ? matches / unionSize : 0;
      const hintCoverage = matches / hint.tokens.length;
      const candCoverage = matches / candTokens.length;

      // Require bidirectional coverage so "The Hunger Games" does NOT match "Mockingjay Part 1"
      if (jaccard >= 0.84 && hintCoverage >= 0.85 && candCoverage >= 0.85) {
        baseScore = Math.round(78 + jaccard * 18);
      } else if (
        yearExact &&
        hintCoverage === 1 &&
        Math.abs(candTokens.length - hint.tokens.length) <= 1 &&
        candTokens.length >= 3
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

async function loadUnifiedXtreamCatalogFast(timeoutMs = 2600): Promise<XtreamFullCatalogPayload | null> {
  if (!isXtreamEnvConfigured()) return null;
  try {
    const byProvider = new Map<string, XtreamFullCatalogPayload>();
    for (const c of getConnectedProvidersMovieAndSeriesCatalogs()) {
      if (c.vodStreams.length > 0 || c.series.length > 0) {
        byProvider.set(c.providerId, c);
      }
    }
    for (const c of getCachedXtreamProviderCatalogs()) {
      if (c.vodStreams.length > 0 || c.series.length > 0) {
        byProvider.set(c.providerId, c);
      }
    }

    if (byProvider.size === 0) {
      const res = await Promise.race([
        syncFullCatalog(false, 'all').catch(() => ({ ok: false as const })),
        new Promise<{ ok: false }>((resolve) => setTimeout(() => resolve({ ok: false }), timeoutMs)),
      ]);
      if (res.ok && 'catalog' in res && res.catalog) {
        return res.catalog;
      }
      return null;
    }

    const okCatalogs = Array.from(byProvider.values());
    const vodCategories = okCatalogs.flatMap((c) =>
      c.vodCategories.map((cat) => ({
        ...cat,
        id: `${c.providerId}:${cat.id}`,
        name: `[${c.providerName}] ${cat.name}`,
      }))
    );
    const vodStreams = okCatalogs.flatMap((c) =>
      c.vodStreams.map((s) => ({ ...s, categoryId: `${c.providerId}:${s.categoryId}` }))
    );
    const seriesCategories = okCatalogs.flatMap((c) =>
      c.seriesCategories.map((cat) => ({
        ...cat,
        id: `${c.providerId}:${cat.id}`,
        name: `[${c.providerName}] ${cat.name}`,
      }))
    );
    const series = okCatalogs.flatMap((c) =>
      c.series.map((s) => ({ ...s, categoryId: `${c.providerId}:${s.categoryId}` }))
    );
    const now = Date.now();
    return {
      providerId: 'all',
      providerName: 'Todos los servidores',
      liveCategories: [],
      liveStreams: [],
      vodCategories,
      vodStreams,
      seriesCategories,
      series,
      counts: {
        liveCategories: 0,
        liveStreams: 0,
        vodCategories: vodCategories.length,
        vodStreams: vodStreams.length,
        seriesCategories: seriesCategories.length,
        series: series.length,
      },
      accountNumber: okCatalogs.length,
      syncedAt: now,
      expiresAt: now + 60_000,
      fromCache: true,
    };
  } catch {
    return null;
  }
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
  return lang;
}

function computeOptionSortKey(opt: XtreamMatchedMediaOption, preferLang?: string): number {
  const normPref = String(preferLang || 'ES').toUpperCase();
  let langRank = 5;
  if (opt.lang === normPref) langRank = 0;
  else if (normPref === 'ES') {
    langRank = opt.lang === 'ES' ? 0 : opt.lang === 'LAT' ? 1 : opt.lang === 'VOSE' ? 2 : opt.lang === 'EN' ? 3 : 5;
  } else if (normPref === 'LAT') {
    langRank = opt.lang === 'LAT' ? 0 : opt.lang === 'ES' ? 1 : opt.lang === 'VOSE' ? 2 : opt.lang === 'EN' ? 3 : 5;
  } else if (normPref === 'EN') {
    langRank = opt.lang === 'EN' ? 0 : opt.lang === 'VOSE' ? 1 : opt.lang === 'ES' ? 2 : 5;
  } else if (normPref === 'VOSE') {
    langRank = opt.lang === 'VOSE' ? 0 : opt.lang === 'EN' ? 1 : opt.lang === 'ES' ? 2 : 5;
  }

  // Quality is weighed heavily so 4K UHD beats lower tiers cleanly within/near preferred tier
  return langRank * 1000 + opt.qualityTier * 100 - Math.min(99, opt.score);
}

interface IndexedVodMovieEntry {
  item: XtreamVodStreamItem;
  catName: string;
  parsed: ParsedXtreamVodMeta;
}

interface IndexedSeriesEntry {
  item: XtreamSeriesItem;
  catName: string;
  parsed: ParsedXtreamVodMeta;
  serYear?: string;
}

interface InvertedSearchIndex<T> {
  versionKey: string;
  entries: T[];
  tokenPostings: Map<string, number[]>;
}

let cachedVodMovieIndex: InvertedSearchIndex<IndexedVodMovieEntry> | null = null;
let cachedSeriesIndex: InvertedSearchIndex<IndexedSeriesEntry> | null = null;
export const cachedLiveTokenMap = new Map<string, number[]>();

function addEntryTokensToMap(
  tokenMap: Map<string, number[]>,
  tokens: string[],
  entryIdx: number
): void {
  const seen = new Set<string>();
  for (const tok of tokens) {
    if (tok.length < 2 || seen.has(tok)) continue;
    seen.add(tok);
    let bucket = tokenMap.get(tok);
    if (!bucket) {
      bucket = [];
      tokenMap.set(tok, bucket);
    }
    bucket.push(entryIdx);
  }
}

export function getIndexedVodMovies(
  vodStreams: XtreamVodStreamItem[],
  vodCategories: Array<{ id: string; providerId?: string; name: string }>,
  versionKey?: string
): InvertedSearchIndex<IndexedVodMovieEntry> {
  const key = versionKey || `vod:${vodStreams.length}:${vodCategories.length}`;
  if (cachedVodMovieIndex && cachedVodMovieIndex.versionKey === key) {
    return cachedVodMovieIndex;
  }
  const catLookup = buildCategoryLookup(vodCategories);
  const tokenPostings = new Map<string, number[]>();
  const entries: IndexedVodMovieEntry[] = vodStreams.map((item, idx) => {
    const pid = item.providerId || 'primary';
    const catName =
      catLookup.get(item.categoryId) ||
      catLookup.get(`${pid}:${item.categoryId}`) ||
      'VOD';
    const parsed = parseXtreamVodTitleMeta(item.name, catName, item.containerExtension);
    addEntryTokensToMap(tokenPostings, tokenizeMeaningful(parsed.cleanTitle), idx);
    return { item, catName, parsed };
  });
  cachedVodMovieIndex = { versionKey: key, entries, tokenPostings };
  return cachedVodMovieIndex;
}

export function getIndexedSeries(
  seriesList: XtreamSeriesItem[],
  seriesCategories: Array<{ id: string; providerId?: string; name: string }>,
  versionKey?: string
): InvertedSearchIndex<IndexedSeriesEntry> {
  const key = versionKey || `ser:${seriesList.length}:${seriesCategories.length}`;
  if (cachedSeriesIndex && cachedSeriesIndex.versionKey === key) {
    return cachedSeriesIndex;
  }
  const catLookup = buildCategoryLookup(seriesCategories);
  const tokenPostings = new Map<string, number[]>();
  const entries: IndexedSeriesEntry[] = seriesList.map((item, idx) => {
    const pid = item.providerId || 'primary';
    const catName =
      catLookup.get(item.categoryId) ||
      catLookup.get(`${pid}:${item.categoryId}`) ||
      'Series';
    const parsed = parseXtreamVodTitleMeta(item.name, catName, '');
    const serYear =
      parsed.year ||
      (item.releaseDate ? String(item.releaseDate).match(/(19\d{2}|20[0-3]\d)/)?.[1] : undefined);
    addEntryTokensToMap(tokenPostings, tokenizeMeaningful(parsed.cleanTitle), idx);
    return { item, catName, parsed, serYear };
  });
  cachedSeriesIndex = { versionKey: key, entries, tokenPostings };
  return cachedSeriesIndex;
}

export function querySearchIndexCandidates<T>(
  index: InvertedSearchIndex<T>,
  hints: Array<{ tokens: string[] }>
): T[] {
  const candidateIdxSet = new Set<number>();
  let usedTokenQuery = false;

  for (const h of hints) {
    const toks = h.tokens.filter((t) => t.length >= 2);
    if (toks.length === 0) continue;
    const postings = toks
      .map((t) => index.tokenPostings.get(t) || [])
      .sort((a, b) => a.length - b.length);
    if (postings[0].length === 0) continue;
    usedTokenQuery = true;

    if (postings.length === 1) {
      for (const idx of postings[0]) candidateIdxSet.add(idx);
    } else {
      const smallest = postings[0];
      const anchor = new Set(smallest);
      const secondSet = new Set(postings[1]);
      for (const idx of anchor) {
        if (secondSet.has(idx)) candidateIdxSet.add(idx);
      }
      if (candidateIdxSet.size === 0) {
        for (const idx of smallest.slice(0, 250)) candidateIdxSet.add(idx);
      }
    }
  }

  if (!usedTokenQuery) return index.entries;
  const result: T[] = [];
  for (const idx of candidateIdxSet) {
    const entry = index.entries[idx];
    if (entry) result.push(entry);
  }
  return result;
}

export async function findXtreamMovieMatches(params: {
  titleHints: string[];
  yearHint?: string;
  preferLang?: string;
  limit?: number;
}): Promise<{ options: XtreamMatchedMediaOption[]; tracks: TrackRecord[] }> {
  const hints = buildHintVectors(params.titleHints);
  if (hints.length === 0) return { options: [], tracks: [] };

  const catalog = await loadUnifiedXtreamCatalogFast(2800);
  if (!catalog || catalog.vodStreams.length === 0) {
    return { options: [], tracks: [] };
  }

  const providerOrder = new Map(getAllXtreamProviders().map((p, idx) => [p.id, idx]));
  const matches: XtreamMatchedMediaOption[] = [];
  const indexed = getIndexedVodMovies(
    catalog.vodStreams as XtreamVodStreamItem[],
    catalog.vodCategories,
    `vod:${catalog.syncedAt}:${catalog.vodStreams.length}`
  );
  const candidateEntries = querySearchIndexCandidates(indexed, hints);

  for (const { item, catName, parsed } of candidateEntries) {
    const pid = item.providerId || 'primary';
    const score = scoreTitleMatchAgainstHints(parsed.cleanTitle, parsed.year, hints, params.yearHint);
    if (score < 76) continue;

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
      cleanTitle: parsed.cleanTitle,
      year: parsed.year,
      categoryName: catName,
      lang: parsed.lang,
      langLabel: parsed.langLabel,
      quality: parsed.quality,
      qualityTier: parsed.qualityTier,
      containerExtension: ext,
      rating: item.rating,
      poster: item.streamIcon,
      playbackUrl,
      score,
    });
  }

  matches.sort((a, b) => {
    const keyDiff = computeOptionSortKey(a, params.preferLang) - computeOptionSortKey(b, params.preferLang);
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
  limit?: number;
}): Promise<XtreamMatchedMediaOption[]> {
  const hints = buildHintVectors(params.titleHints);
  if (hints.length === 0) return [];

  const catalog = await loadUnifiedXtreamCatalogFast(2800);
  if (!catalog || catalog.series.length === 0) return [];

  const providerOrder = new Map(getAllXtreamProviders().map((p, idx) => [p.id, idx]));
  const matches: XtreamMatchedMediaOption[] = [];
  const indexed = getIndexedSeries(
    catalog.series as XtreamSeriesItem[],
    catalog.seriesCategories,
    `ser:${catalog.syncedAt}:${catalog.series.length}`
  );
  const candidateEntries = querySearchIndexCandidates(indexed, hints);

  for (const { item: ser, catName, parsed, serYear } of candidateEntries) {
    const pid = ser.providerId || 'primary';
    const score = scoreTitleMatchAgainstHints(parsed.cleanTitle, serYear, hints, params.yearHint);
    if (score < 76) continue;

    matches.push({
      id: `xtream-ser-${pid}-${ser.seriesId}`,
      mediaType: 'tv',
      providerId: pid,
      providerName: ser.providerName || pid,
      streamId: ser.seriesId,
      seriesId: ser.seriesId,
      title: ser.name,
      cleanTitle: parsed.cleanTitle,
      year: serYear,
      categoryName: catName,
      lang: parsed.lang,
      langLabel: parsed.langLabel,
      quality: parsed.quality,
      qualityTier: parsed.qualityTier,
      containerExtension: 'mp4',
      rating: ser.rating,
      poster: ser.cover,
      score,
    });
  }

  matches.sort((a, b) => {
    const keyDiff = computeOptionSortKey(a, params.preferLang) - computeOptionSortKey(b, params.preferLang);
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
}): Promise<TrackRecord[]> {
  const seriesOptions = await findXtreamSeriesMatches({
    titleHints: params.titleHints,
    yearHint: params.yearHint,
    preferLang: params.preferLang,
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
      label: `${opt.providerName} · ${opt.langLabel} · ${bestQualityLabel}`,
      lang: toExtractorLang(opt.lang),
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

export interface ParsedInternalXtreamVodTarget {
  source: 'providers' | 'xtream';
  providerId: string;
  kind: 'movie' | 'series';
  streamId: string;
  ext: string;
}

export function parseInternalXtreamVodUrl(rawUrl: string): ParsedInternalXtreamVodTarget | null {
  const input = String(rawUrl || '').trim();
  if (!input) return null;

  const provMatch = input.match(
    /^\/api\/providers\/stream\/([^/]+)\/(movie|series)\/([a-zA-Z0-9_-]+)(?:\.([a-zA-Z0-9]{2,5}))?(?:\?|$)/i
  );
  if (provMatch) {
    return {
      source: 'providers',
      providerId: decodeURIComponent(provMatch[1]),
      kind: provMatch[2].toLowerCase() === 'series' ? 'series' : 'movie',
      streamId: provMatch[3],
      ext: (provMatch[4] || 'mp4').toLowerCase(),
    };
  }

  if (/^\/api\/stream\?/i.test(input)) {
    try {
      const parsed = new URL(input, 'http://localhost');
      const mediaType = (parsed.searchParams.get('type') || '').toLowerCase();
      if (mediaType !== 'vod' && mediaType !== 'series') return null;
      const providerId = String(parsed.searchParams.get('provider') || 'primary').trim();
      const streamId = String(parsed.searchParams.get('id') || '').trim();
      const ext = String(parsed.searchParams.get('ext') || 'mp4').trim().toLowerCase() || 'mp4';
      if (!streamId) return null;
      return {
        source: 'xtream',
        providerId,
        kind: mediaType === 'series' ? 'series' : 'movie',
        streamId,
        ext,
      };
    } catch {
      return null;
    }
  }

  return null;
}

export async function probeInternalXtreamVodUrl(
  rawUrl: string,
  timeoutMs = 4500
): Promise<{ ok: boolean; target: ParsedInternalXtreamVodTarget | null }> {
  const target = parseInternalXtreamVodUrl(rawUrl);
  if (!target) {
    return { ok: false, target: null };
  }

  const cacheKey = `${target.source}:${target.providerId}:${target.kind}:${target.streamId}:${target.ext}`;
  const cached = vodProbeResultCache.get(cacheKey);
  if (cached) return cached;

  const existingInFlight = inFlightVodProbeMap.get(cacheKey);
  if (existingInFlight) return existingInFlight;

  const runProbe = async (): Promise<{ ok: boolean; target: ParsedInternalXtreamVodTarget | null }> => {
    if (target.source === 'providers') {
      const provProbe = await resolveProviderVodOrSeriesUrl(
        target.providerId,
        target.kind,
        target.streamId,
        target.ext,
        timeoutMs
      ).catch(() => ({ ok: false }));
      if (provProbe.ok) {
        const res = { ok: true, target };
        vodProbeResultCache.set(cacheKey, res);
        return res;
      }
      const fallbackProbe = await resolveUpstreamVodOrSeriesUrl(
        target.streamId,
        target.ext,
        target.providerId,
        target.kind === 'series' ? 'series' : 'vod'
      ).catch(() => ({ ok: false }));
      const res = { ok: Boolean(fallbackProbe.ok), target };
      if (res.ok) vodProbeResultCache.set(cacheKey, res);
      return res;
    }

    const xtProbe = await resolveUpstreamVodOrSeriesUrl(
      target.streamId,
      target.ext,
      target.providerId,
      target.kind === 'series' ? 'series' : 'vod'
    ).catch(() => ({ ok: false }));
    if (xtProbe.ok) {
      const res = { ok: true, target };
      vodProbeResultCache.set(cacheKey, res);
      return res;
    }
    const provFallback = await resolveProviderVodOrSeriesUrl(
      target.providerId,
      target.kind,
      target.streamId,
      target.ext,
      timeoutMs
    ).catch(() => ({ ok: false }));
    const res = { ok: Boolean(provFallback.ok), target };
    if (res.ok) vodProbeResultCache.set(cacheKey, res);
    return res;
  };

  const probePromise = runProbe().finally(() => {
    inFlightVodProbeMap.delete(cacheKey);
  });
  inFlightVodProbeMap.set(cacheKey, probePromise);
  return probePromise;
}

